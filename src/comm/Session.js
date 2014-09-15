'use strict';

module.exports = Session;


var bunyan = require('bunyan');
var domain = require('domain');
var events = require('events');
var util = require('util');


util.inherits(Session, events.EventEmitter);


/**
 * A `Session` object corresponds to the connection between one game
 * client and the game server it is connected to. A new session is
 * initialized for each new connection to the GS; after successful
 * login, the respective {@link Player} object is associated with the
 * session (and vice-versa), linking the model and communications
 * layers.
 *
 * Incoming data is passed on to the data handler for request
 * processing; any unhandled errors there bubble up to the generic,
 * {@link http://nodejs.org/docs/latest/api/domain.html|domain} based
 * error handling function here ({@link
 * Session#handleError|handleError}), as well as low-level networking
 * errors.
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
 * @param {function} dataHandler
 * ```
 * dataHandler(session, data)
 * ```
 * consumer of incoming socket data; called whenever the socket's
 * `data` event is emitted, i.e. the supplied data chunk is not
 * necessarily a single, complete request
 *
 * @constructor
 */
function Session(id, socket, dataHandler) {
	Session.super_.call(this);
	this.id = id;
	this.socket = socket;
	this.dataHandler = dataHandler;
	this.ts = new Date().getTime();
	// set up customized bunyan child logger
	this.log = log.child({serializers: {
		session: Session.logSerialize,
		err: bunyan.stdSerializers.err,
	}});
	// disable Nagle's algorithm (we need all messages delivered as quickly as possible)
	this.socket.setNoDelay(true);
	// set up domain for low-level issue handling (networking and
	// AMF deserialization issues)
	this.dom = domain.create();
	this.dom.add(this.socket);
	this.dom.on('error', this.handleError.bind(this));
	this.setupSocketEventHandlers();
	this.log.info({session: this}, 'new session created');
}


Session.prototype.setupSocketEventHandlers = function() {
	this.socket.on('data', this.onSocketData.bind(this));
	this.socket.on('end', this.onSocketEnd.bind(this));
	this.socket.on('timeout', this.onSocketTimeout.bind(this));
	this.socket.on('close', this.onSocketClose.bind(this));
	// 'error' handled by domain error handler anyway
};


Session.prototype.toString = function() {
	return util.format('[session#%s%s]', this.id, this.pc ? '|' + this.pc.tsid : '');
};


/**
 * Class method for serializing the session field for the
 * session-specific child logger.
 * @see {@link https://github.com/trentm/node-bunyan#logchild}
 * @static
 * @private
 */
Session.logSerialize = function(session) {
	var ret = {id: session.id};
	if (session.socket && session.socket.remoteAddress) {
		ret.addr = session.socket.remoteAddress + ':' + session.socket.remotePort;
	}
	if (session.pc) {
		ret.pc = session.pc.tsid;
	}
	return ret;
};


Session.prototype.onSocketData = function(data) {
	// wrap in nextTick to make sure sync errors are handled, too;
	// see <https://stackoverflow.com/q/19461234/>
	var self = this;
	process.nextTick(function onSocketData() {
		self.dataHandler(self, data);
	});
};


Session.prototype.onSocketEnd = function() {
	this.log.info({session: this}, 'socket end');
};


Session.prototype.onSocketTimeout = function() {
	this.log.warn({session: this}, 'socket timeout');
};


Session.prototype.onSocketClose = function(hadError) {
	this.log.info({session: this}, 'socket close (hadError: %s)', hadError);
	this.emit('close', this);
};


/**
 * Handles low-level networking errors, as well as any unhandled errors
 * from higher layers (e.g. game logic), currently simply terminating
 * the connection to the client.
 *
 * TODO: more elaborate error handling.
 *
 * @param {Error} error the error to handle
 */
Session.prototype.handleError = function(err) {
	this.log.error({session: this, err: err},
		'unhandled error: %s', err ? err.message : err);
	// careful cleanup - if anything throws here, the server goes down
	if (this.socket && typeof this.socket.destroy === 'function') {
		this.log.info({session: this}, 'destroying socket');
		this.socket.destroy();
	}
};
