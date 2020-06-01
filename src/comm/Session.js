'use strict';

module.exports = Session;


var _ = require('lodash');
var assert = require('assert');
var auth = require('comm/auth');
var config = require('config');
var domain = require('domain');
var events = require('events');
var pers = require('data/pers');
var rpc = require('data/rpc');
var util = require('util');
var RQ = require('data/RequestQueue');
var gsjsBridge = require('model/gsjsBridge');
var metrics = require('metrics');


util.inherits(Session, events.EventEmitter);


/**
 * A `Session` object corresponds to the connection between one game
 * client and the game server it is connected to. A new session is
 * initialized for each new connection to the GS; after successful
 * login, the respective {@link Player} object is associated with the
 * session (and vice-versa), linking the model and communications
 * layers.
 *
 * Incoming data is deserialized here, and each resulting message is
 * passed on to the GSJS request handler for processing within a new
 * request context. Any unhandled errors there are processed by the
 * {@link Session#handleAmfReqError|handleAmfReqError} function; lower
 * level problems (e.g. during AMF deserialization) are handled by the
 * {@link http://nodejs.org/docs/latest/api/domain.html|domain} based
 * {@link Session#handleError|handleError} function, as well as
 * networking errors.
 *
 * Since sessions are usually short-lived (client commonly has to
 * reconnect to other GS when the player is changing locations) and
 * the client already contains functionality to reconnect after an
 * intermittent connection loss, they are not persisted across server
 * restarts.
 *
 * `Session` is a Node.js `{@link http://nodejs.org/api/events.html#events_class_events_eventemitter
 * EventEmitter}`, emitting the following events:
 * * `close` when the client connection has been closed (cleanly or
 *   after an error)
 *
 * @param {string} id unique ID for this session (unique per GS)
 * @param {Socket} socket TCP socket connection to the client
 *
 * @constructor
 */
function Session(id, socket) {
	Session.super_.call(this);
	this.id = id;
	this.loggedIn = false;
	this.preLoginBuffer = [];
	this.socket = socket;
	this.ts = new Date().getTime();
	this.maxMsgSize = config.get('net:maxMsgSize');
	// set up domain for low-level issue handling (networking and
	// AMF deserialization issues)
	this.dom = domain.create();
	this.dom.add(this.socket);
	this.dom.on('error', this.handleError.bind(this));
	this.setupSocketEventHandlers();
	this.gsjsProcessMessage = gsjsBridge.getMain().processMessage;
	log.info({session: this, addr: socket.remoteAddress, port: socket.remotePort},
		'new session created');
}


Session.prototype.setupSocketEventHandlers = function setupSocketEventHandlers() {
	this.socket.on('message', this.onSocketMessage.bind(this));
	this.socket.on('end', this.onSocketEnd.bind(this));
	this.socket.on('timeout', this.onSocketTimeout.bind(this));
	this.socket.on('close', this.onSocketClose.bind(this));
	// 'error' handled by domain error handler anyway
};


Session.prototype.toString = function toString() {
	return util.format('[session#%s%s]', this.id, this.pc ? '|' + this.pc.tsid : '');
};


/**
 * Class method for serializing the session field for the
 * session-specific child logger.
 * @see {@link https://github.com/trentm/node-bunyan#logchild}
 * @static
 * @private
 */
Session.logSerialize = function logSerialize(session) {
	return session.id;
};


Session.prototype.onSocketMessage = function onSocketMessage(message) {
	try {
		setImmediate(this.enqueueMessage.bind(this), JSON.parse(message));
	}
	catch (err) {
		log.error({session: this, err: err}, 'failed to parse incoming message');
		this.socket.terminate();
	}
};


Session.prototype.onSocketEnd = function onSocketEnd() {
	log.info({session: this}, 'socket end');
};


Session.prototype.onSocketTimeout = function onSocketTimeout() {
	log.warn({session: this}, 'socket timeout');
};


Session.prototype.onSocketClose = function onSocketClose(code) {
	log.info({session: this}, 'socket close (code: %s)', code);
	delete this.socket;
	if (this.pc && this.pc.isConnected()) {
		// if pc is still linked to session, socket has been closed without a
		// "logout" request; could be an error/unexpected connection loss or a
		// move to another GS (Player#onDisconnect will act accordingly)
		this.close(this.emit.bind(this, 'close', this));
	}
	else {
		this.emit('close', this);
	}
};


Session.prototype.close = function close(done) {
	log.info({session: this}, 'session close');
	if (this.pc && this.pc.isConnected()) {
		var rq;
		try {
			rq = this.pc.getRQ();
		}
		catch (err) {
			log.error(err, 'error while closing session');
			return done ? done() : undefined;
		}
		var self = this;
		rq.push('sessionClose',
			this.pc.onDisconnect.bind(this.pc),
			function cb(err, res) {
				if (err) log.error(err, 'error while closing session');
				if (self.socket) self.socket.terminate();
				if (done) done();
			},
			{waitPers: true, obj: this.pc}
		);
	}
	else if (done) done();
};


/**
 * Handles low-level networking errors, as well as any errors from
 * higher layers (e.g. game logic) that were not caught by the request
 * context error handler
 * (see {@link Session#handleAmfReqError|handleAmfReqError}).
 * Currently simply terminates the connection to the client.
 *
 * TODO: more elaborate error handling.
 *
 * @param {Error} err the error to handle
 * @private
 */
Session.prototype.handleError = function handleError(err) {
	log.error({session: this, err: err},
		'unhandled error: %s', err ? err.message : err);
	// careful cleanup - if anything throws here, the server goes down
	if (this.socket && this.socket.terminate) {
		log.info({session: this}, 'destroying socket');
		this.socket.terminate();
	}
};


Session.prototype.enqueueMessage = function enqueueMessage(msg) {
	log.trace({data: msg}, 'queueing %s request', msg.type);
	metrics.increment('net.amf.rx', 0.01);
	if (msg.type === 'ping') {
		this.processRequest(msg);
	}
	else {
		var rq = this.pc ? this.pc.getRQ() : RQ.getGlobal('prelogin');
		rq.push(msg.type, this.processRequest.bind(this, msg),
			this.handleAmfReqError.bind(this, msg),
			{session: this, obj: this.pc, timerTag: msg.type});
	}
};


Session.prototype.processRequest = function processRequest(req) {
	log.trace({data: req}, 'handling %s request', req.type);
	var abort = this.preRequestProc(req);
	if (abort) return;
	this.gsjsProcessMessage(this.pc, req);
	this.postRequestProc(req);
};


/**
 * Things that need to be done *before* forwarding the request to
 * GSJS for processing.
 *
 * @returns {boolean} `true` if request processing should be aborted
 *          (e.g. on logout or critical errors)
 * @private
 */
Session.prototype.preRequestProc = function preRequestProc(req) {
	switch (req.type) {
		case 'login_start':
		case 'relogin_start':
			assert(this.pc === undefined, 'session already bound: ' + this.pc);
			// retrieve PC via auth token, verify, link to this session
			var tsid = auth.authenticate(req.token);
			if (!rpc.isLocal(tsid)) {
				// this should not happen (client should get correct connect
				// data from webapp/HTTP API), so don't try to fix it here
				log.warn('%s trying to log in on wrong GS', tsid);
				if (this.socket) this.socket.end();
				return true;
			}
			this.pc = pers.get(tsid, true);
			assert(this.pc !== undefined, 'unable to load player: ' + tsid);
			// prepare Player object for login (e.g. call GSJS events)
			this.pc.onLoginStart(this, req.type === 'relogin_start');
			break;
		case 'logout':
			if (this.pc) this.pc.onDisconnect();
			if (this.socket) this.socket.close();
			return true;
		case 'ping':
			this.send({
				msg_id: req.msg_id,
				type: req.type,
				success: true,
				ts: Math.round(new Date().getTime() / 1000),
			});
			return true;
		default:
			if (!this.pc) {
				log.info({session: this}, 'closing session after unexpected' +
					' %s request in pre-auth session', req.type);
				if (this.socket) this.socket.terminate();
				return true;
			}
	}
};


/**
 * Things that need to be done *after* the request has been handled by
 * GSJS.
 * @private
 */
Session.prototype.postRequestProc = function postRequestProc(req) {
	switch (req.type) {
		case 'login_end':
			// put player into location (same as regular move end)
			this.pc.endMove();
			this.pc.location.gsOnPlayerEnter(this.pc);
			this.flushPreLoginBuffer();
			break;
		case 'relogin_end':
			this.pc.location.gsOnPlayerEnter(this.pc);
			// call Location.onPlayerReconnect event to make client hide hidden
			// decos after reconnecting (relogin_start is too early for this),
			// but only on "real" reconnects (not door/sp moves between GSs)
			if (req.relogin_type === 'relogin') {
				this.pc.location.onPlayerReconnect(this.pc);
			}
			this.flushPreLoginBuffer();
			break;
		case 'signpost_move_end':
		case 'follow_move_end':
		case 'door_move_end':
		case 'teleport_move_end':
			this.pc.location.gsOnPlayerEnter(this.pc);
			break;
	}
	// make sure changes/announcements caused by this request are sent out
	if (this.loggedIn) {
		this.pc.location.flush();
	}
};


Session.prototype.flushPreLoginBuffer = function flushPreLoginBuffer() {
	if (!this.preLoginBuffer || !this.preLoginBuffer.length) return;
	if (log.debug) {
		log.debug({queue: this.preLoginBuffer.map(function getType(msg) {
			return msg.type;
		})}, '(re)login complete, flushing queued messages');
	}
	this.preLoginBuffer.forEach(this.send, this);
	this.preLoginBuffer = [];
};


Session.prototype.handleAmfReqError = function handleAmfReqError(req, err) {
	if (!err) return;
	if (!_.isObject(req)) req = {};
	if (_.isString(err)) {
		// catch malcontents throwing strings instead of Errors
		err = new Error(err);
	}
	log.error(err, 'error processing %s request for %s', req.type, this.pc);
	if (this.socket) {
		if (this.pc && this.pc.isConnected()) {
			this.pc.sendServerMsg('CLOSE',
				{msg: util.format('error processing %s request', req.type)});
		}
		log.info({session: this}, 'closing session after error');
		this.socket.terminate();
	}
};


/**
 * Sends an AMF3 encoded message to the connected client (prefixed by
 * the message length, as the client expects).
 *
 * @param {object} msg the message to send; must not contain anything
 *        that cannot be encoded in AMF3 (e.g. circular references)
 */
Session.prototype.send = function send(msg) {
	// only allow sending if socket is open, i.e. readyState = 1
	if (!this.socket || this.socket.readyState !== 1) {
		log.debug('socket is gone or not ready, dropping %s message', msg.type);
		return;
	}
	if (!this.loggedIn) {
		if (msg.type !== 'login_start' && msg.type !== 'login_end' &&
			msg.type !== 'relogin_start' && msg.type !== 'relogin_end' &&
			msg.type !== 'ping') {
			log.debug('(re)login incomplete, postponing %s message', msg.type);
			this.preLoginBuffer.push(msg);
			return;
		}
		if (msg.type === 'login_end' || msg.type === 'relogin_end') {
			this.loggedIn = true;
		}
	}
	if (log.trace()) {
		log.trace({data: msg, to: this.pc ? this.pc.tsid : undefined},
			'sending %s message', msg.type);
	}
	this.socket.send(JSON.stringify(msg));
	metrics.increment('net.amf.tx', 0.01);
};
