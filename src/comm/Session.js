'use strict';

module.exports = Session;


var amf = require('node_amf_cc');
var assert = require('assert');
var auth = require('comm/auth');
var config = require('config');
var domain = require('domain');
var events = require('events');
var pers = require('data/pers');
var rpc = require('data/rpc');
var util = require('util');
var RC = require('data/RequestContext');
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
	// disable Nagle's algorithm (we need all messages delivered as quickly as possible)
	this.socket.setNoDelay(true);
	// set up domain for low-level issue handling (networking and
	// AMF deserialization issues)
	this.dom = domain.create();
	this.dom.add(this.socket);
	this.dom.on('error', this.handleError.bind(this));
	this.setupSocketEventHandlers();
	this.gsjsProcessMessage = gsjsBridge.getMain().processMessage;
	log.info({session: this}, 'new session created');
}


Session.prototype.setupSocketEventHandlers = function setupSocketEventHandlers() {
	this.socket.on('data', this.onSocketData.bind(this));
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
	var ret = {id: session.id};
	if (session.socket && session.socket.remoteAddress) {
		ret.addr = session.socket.remoteAddress + ':' + session.socket.remotePort;
	}
	if (session.pc) {
		ret.pc = session.pc.tsid;
	}
	return ret;
};


Session.prototype.onSocketData = function onSocketData(data) {
	// wrap in nextTick to make sure sync errors are handled, too;
	// see <https://stackoverflow.com/q/19461234/>
	process.nextTick(this.handleData.bind(this, data));
};


Session.prototype.onSocketEnd = function onSocketEnd() {
	log.info({session: this}, 'socket end');
};


Session.prototype.onSocketTimeout = function onSocketTimeout() {
	log.warn({session: this}, 'socket timeout');
};


Session.prototype.onSocketClose = function onSocketClose(hadError) {
	log.info({session: this}, 'socket close (hadError: %s)', hadError);
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
		var self = this;
		new RC('sessionClose', this.pc, this).run(
			this.pc.onDisconnect.bind(this.pc),
			function cb(err) {
				if (err) log.error(err, 'error while closing session');
				if (self.socket) self.socket.destroy();
				if (done) done();
			}, true
		);
	}
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
	if (this.socket && typeof this.socket.destroy === 'function') {
		log.info({session: this}, 'destroying socket');
		this.socket.destroy();
	}
};


/**
 * Consumer of incoming socket data. Called whenever the socket's
 * `data` event is emitted (i.e. the supplied data chunk is not
 * necessarily a single, complete request).
 *
 * @param {Buffer} data incoming data chunk
 * @private
 */
Session.prototype.handleData = function handleData(data) {
	if (!this.buffer) {
		this.buffer = data;
	}
	else {
		var len = this.buffer.length + data.length;
		this.buffer = Buffer.concat([this.buffer, data], len);
	}
	setImmediate(this.checkForMessages.bind(this));
};


Session.prototype.checkForMessages = function checkForMessages() {
	// if node scheduled multiple consecutive calls, the first one has already
	// processed all available messages, so, hammertime
	if (!this.buffer) return;
	// buffer can contain multiple messages (and the last one may be incomplete);
	// since we don't have message length data, all we can do is try parsing
	// messages repeatedly until all data is consumed, or deserialization fails
	var bufstr = this.buffer.toString('binary');
	while (bufstr.length > 0) {
		var msg;
		try {
			var deser = amf.deserialize(bufstr);
			msg = deser.value;
			bufstr = bufstr.substr(deser.consumed);
		}
		catch (e) {
			// incomplete message; abort and preserve remaining (unparsed) data
			// for next round
			log.debug('%s bytes remaining', bufstr.length);
			this.buffer = new Buffer(bufstr, 'binary');
			break;
		}
		// still here? then schedule message handling
		var timer = metrics.createTimer('req.wait', 0.1);
		setImmediate(this.handleMessage.bind(this), msg, timer);
	}
	if (bufstr.length === 0) {
		delete this.buffer;  // buffer fully processed
	}
	// protection against broken/malicious clients
	if (this.buffer && this.buffer.length > this.maxMsgSize) {
		throw new Error('could not process incoming message(s) ' +
			'(buffer length: ' + this.buffer.length + ' bytes)');
	}
};


Session.prototype.handleMessage = function handleMessage(msg, waitTimer) {
	if (waitTimer) waitTimer.stop();
	log.trace({data: msg}, 'got %s request', msg.type);
	metrics.increment('net.amf.rx', 0.01);
	var self = this;
	var rc = new RC(msg.type, this.pc, this);
	this.dom.run(function domWrapper() {
		rc.run(
			function clientReq() {
				var procTimer = metrics.createTimer('req.proc.' + msg.type,
					(msg.type === 'move_xy') ? 0.1 : undefined);
				self.processRequest.call(self, msg);
				if (procTimer) procTimer.stop();
			},
			function callback(err) {
				if (err) self.handleAmfReqError.call(self, err, msg);
			}
		);
	});
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
				this.socket.end();
				return true;
			}
			this.pc = pers.get(tsid, true);
			assert(this.pc !== undefined, 'unable to load player: ' + tsid);
			// prepare Player object for login (e.g. call GSJS events)
			this.pc.onLoginStart(this, req.type === 'relogin_start');
			break;
		case 'logout':
			if (this.pc) this.pc.onDisconnect();
			this.socket.end();
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
				this.socket.destroy();
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
			// call Location.onPlayerReconnect event (necessary to make client
			// hide hidden decos after reconnecting; relogin_start is too early
			// for this)
			this.pc.location.onPlayerReconnect(this.pc);
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


Session.prototype.handleAmfReqError = function handleAmfReqError(err, req) {
	if (!err) return;
	if (typeof req !== 'object') req = {};
	if (typeof err === 'object' && err.type === 'stack_overflow') {
		// special treatment for stack overflow errors
		// see https://github.com/trentm/node-bunyan/issues/127
		err = new Error(err.message);
	}
	if (typeof err === 'string') {
		// catch malcontents throwing strings instead of Errors, e.g.
		// https://github.com/tvcutsem/harmony-reflect/issues/38
		err = new Error(err);
	}
	log.error(err, 'error processing %s request for %s', req.type, this.pc);
	if (this.socket) {
		if (this.pc && this.pc.isConnected()) {
			this.pc.sendServerMsg('CLOSE',
				{msg: util.format('error processing %s request', req.type)});
		}
		log.info({session: this}, 'closing session after error');
		this.socket.destroy();
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
	// JSON roundtrip workaround because AMF serialization currently does not
	// work for ES6 proxies - see e.g. https://github.com/joyent/node/issues/7526
	//TODO: remove this when it's no longer necessary
	msg = JSON.parse(JSON.stringify(msg));
	if (log.trace()) {
		log.trace({data: msg, to: this.pc ? this.pc.tsid : undefined},
			'sending %s message', msg.type);
	}
	var data = amf.serialize(msg);
	var size = Buffer.byteLength(data, 'binary');
	var buf = new Buffer(4 + size);
	buf.writeUInt32BE(size, 0);
	buf.write(data, 4, size, 'binary');
	this.socket.write(buf);
	metrics.increment('net.amf.tx', 0.01);
};
