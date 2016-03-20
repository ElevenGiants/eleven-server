'use strict';

/**
 * Generic request processing helper, managing sequential, one-by-one execution
 * of requests (received as `function` objects through {@link RequestQueue#push|
 * push}).
 */

module.exports = RequestQueue;

var assert = require('assert');
var async = require('async');
var events = require('events');
var metrics = require('metrics');
var RC = require('data/RequestContext');
var util = require('util');
var utils = require('utils');

// container for "regular" request queues, each one assigned to a specific top
// level game object (location or group), its TSID used as the key here
var rqs = {};
// shutdown in progress flag
var shuttingDown = false;

/**
 * Initializes internal data structures and metrics.
 *
 * @static
 */
RequestQueue.init = function init() {
	rqs = {};
	shuttingDown = false;
	metrics.setupGaugeInterval('req.rq.count', function getCount() {
		return rqs ? Object.keys(rqs).length : 0;
	});
	metrics.setupGaugeInterval('req.rq.avgLength', function getLength() {
		var n = 0;
		var i = 0;
		for (var k in rqs) {
			n += rqs[k].getLength();
			i++;
		}
		return i === 0 ? 0 : n / i;
	});
};


/**
 * Instantiates a new request queue. This constructor should not normally be
 * used directly; instead, use the {@link RequestQueue.create|create} factory
 * function.
 *
 * @param {string} id unique ID (e.g. TSID of the game object this queue is
 *        logically assigned to)
 *
 * @constructor
 */
function RequestQueue(id) {
	RequestQueue.super_.call(this);
	this.queue = [];
	this.inProgress = null;
	this.closing = false;
	this.id = id;
}
util.inherits(RequestQueue, events.EventEmitter);


/**
 * Creates and registers a new request queue.
 *
 * @param {string} id TSID of the game object the new queue will be assigned to
 * @returns {RequestQueue|undefined} the new queue, or `undefined` if the given
 *          TSID indicates an object that does not have its own queue
 * @throws {AssertionError} if a queue already exists for the given object
 * @static
 */
RequestQueue.create = function create(id) {
	assert(!shuttingDown, 'request queue shutdown initiated');
	assert(!rqs[id], 'RQ ' + id + ' already exists');
	if (utils.isGameObject(id) && !(utils.isLoc(id) || utils.isGroup(id))) {
		log.trace('%s is not worthy of its own RQ', id);
		return;
	}
	var rq = new RequestQueue(id);
	rqs[id] = rq;
	log.info('new request queue registered: %s', rq);
	return rq;
};


RequestQueue.shutdown = function shutdown(done) {
	var keys = Object.keys(rqs);
	log.info('request queue shutdown initiated (%s RQs)', keys.length);
	shuttingDown = true;
	async.eachLimit(keys, 5, function iter(k, cb) {
		var rq = rqs[k];
		log.info('closing %s', rq);
		rq.closing = true;
		rq.closeCallback = cb;
		rq.next();  // make sure closeCallback is called for empty queues
	}, function callback() {
		log.info('request queue shutdown complete');
		done();
	});
};


/**
 * Retrieves the request queue for a specific game object, creating/initializing
 * it if necessary.
 *
 * @param {GameObject|string} objOrTsid the game object to get the request queue
 *        for, or its TSID; must be a "top level" object that has its own RQ
 *        assigned (i.e. a location or a group)
 * @param {boolean} [dontCreate] if `true`, do **not** create the RQ on demand
 * @returns {RequestQueue|undefined} the requested queue
 * @static
 */
RequestQueue.get = function get(objOrTsid, dontCreate) {
	var tsid = typeof objOrTsid === 'string' ? objOrTsid : objOrTsid.tsid;
	if (!rqs[tsid] && !dontCreate) RequestQueue.create(tsid);
	return rqs[tsid];
};


/**
 * Returns a request queue for operations not tied to a specific game object.
 *
 * @param {string} [id] unique identifier (should indicate the intended purpose)
 * @returns {RequestQueue} the request queue
 * @static
 */
RequestQueue.getGlobal = function getGlobal(id) {
	id = id || 'global';
	id = '_' + id.toUpperCase();
	if (!rqs[id]) RequestQueue.create(id);
	return rqs[id];
};


/**
 * Returns the request queue the current request is being executed in.
 *
 * @returns {RequestQueue} the request queue
 * @throws {AssertionError} when called outside a request scope
 */
RequestQueue.getCurrent = function getCurrent() {
	return RC.getContext().rq;
};


RequestQueue.prototype.toString = function toString() {
	return '[rq:' + this.id + ']';
};


/**
 * Retrieves the current request queue length.
 *
 * @returns {number} the current queue length
 */
RequestQueue.prototype.getLength = function getLength() {
	return this.queue ? this.queue.length : 0;
};


/**
 * Adds a new request to the queue.
 *
 * @param {string} tag brief text uniquely identifying the request within a
 *        client session (e.g. a function name); used for RPC synchronization
 * @param {function} func the request function to be executed
 * @param {function} [callback]
 * ```
 * callback(error, result)
 * ```
 * for getting back the request function result, or errors that occurred during
 * its execution (if not specified, errors and/or the result are lost)
 * @param {object} [options] additional parameters for this request
 * @param {Session} [options.session] client session where the request
 *        originated (if applicable)
 * @param {boolean} [options.close] if `true`, the queue will immediately stop
 *        accepting new requests, and shut down after handling this request
 * @param {boolean} [options.waitPers] if `true`, wait for persistence
 *        operations to finish before invoking callback
 * @param {GameObject} [options.obj] game object that is the subject of the
 *        request (for logging)
 * @returns {object} the resulting request queue entry
 */
RequestQueue.prototype.push = function push(tag, func, callback, options) {
	if (this.closing) {
		log.warn('tried to push %s request, but %s is shutting down', tag, this);
		return callback ? callback() : undefined;
	}
	if (options && options.obj) tag = options.obj.tsid + '.' + tag;
	var entry = {
		tag: tag + '_' + Date.now(),
		func: func,
		waitTimer: metrics.createTimer('req.wait', 0.1),
	};
	if (callback) entry.callback = callback;
	if (options) entry.options = options;
	// handle requests belonging to the same context as the currently active
	// request (typically nested RPCs) directly, to avoid deadlocks
	if (this.inProgress && tag && tag.startsWith(this.inProgress.tag)) {
		entry.nested = true;
		setImmediate(this.handle.bind(this, entry, true));
	}
	else {
		this.queue.push(entry);
	}
	if (options && options.close) {
		this.closing = true;
		log.info('request queue flagged for shutdown: %s', this);
	}
	setImmediate(this.next.bind(this));
	return entry;
};


/**
 * Checks if there are any pending requests, and triggers execution of the next
 * one if so. If the queue is flagged for shutdown and there are no more pending
 * requests, performs the shutdown.
 *
 * @private
 */
RequestQueue.prototype.next = function next() {
	log.trace({len: this.queue.length}, 'checking for next request');
	if (this.inProgress) return;
	if (this.queue.length) {
		if (this.closing) log.debug('%s request(s) remaining before closing %s',
			this.queue.length, this);
		this.handle(this.queue.shift());
	}
	else if (this.closing && rqs[this.id]) {
		delete rqs[this.id];
		log.info('request queue closed: %s', this);
		if (this.closeCallback) this.closeCallback();
	}
};


/**
 * Handles a request.
 *
 * @param {object} req the request to handle (an object previously added to the
 *        queue by {@link RequestQueue#push|push})
 * @private
 */
RequestQueue.prototype.handle = function handle(req) {
	var options = req.options || {};
	if (req.waitTimer) req.waitTimer.stop();
	log.trace('handling %s request', req.tag);
	if (req.canceled) {
		log.debug('not handling %s request (canceled)', req.tag);
		return setImmediate(this.next.bind(this));
	}
	if (!req.nested) this.inProgress = req;
	var self = this;
	var rc = new RC(req.tag, this.id, options.session, this);
	rc.run(
		req.func,
		function callback(err, res) {
			log.trace('finished %s request', req.tag);
			if (!req.nested) {
				self.inProgress = null;
				setImmediate(self.next.bind(self));
			}
			if (req.callback) return req.callback(err, res);
		},
		options.waitPers
	);
};
