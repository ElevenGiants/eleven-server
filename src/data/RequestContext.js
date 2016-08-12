'use strict';

module.exports = RequestContext;


var assert = require('assert');
var events = require('events');
var util = require('util');
var wait = require('wait.for');
var Fiber = require('fibers');
var metrics = require('metrics');
var pers = require('data/pers');


util.inherits(RequestContext, events.EventEmitter);


/**
 * Provides functionality to process requests (e.g. from game clients,
 * the HTTP API or remote game servers) within a dedicated context
 * using {@link https://github.com/laverdet/node-fibers|Fibers}.
 * Request handler functions are wrapped in the context with the
 * {@link RequestContext#run|run} function, and can then access
 * request-local data structures through properties and methods of the
 * `RequestContext` instance.
 *
 * In addition, the Fiber context enables all wrapped code to use
 * Fibers-based features like {@link
 * https://github.com/luciotato/waitfor|wait.for}.
 *
 * @param {string} [tag] short text describing the nature or type of the request
 *        (should uniquely identify the request within a client session)
 * @param {GameObject|string} [owner] game object in whose queue the
 *        request is executed (commonly a {@link Location} or {@link
 *        Group}), respecively their TSID (just for logging)
 * @param {Session} [session] client session where the request
 *        originated (if applicable)
 * @param {RequestQueue} [queue] the RQ this request is being processed in
 *
 * @constructor
 */
function RequestContext(tag, owner, session, queue, timerTag) {
	this.tag = tag;
	this.owner = owner;
	this.session = session;
	this.rq = queue;
	this.timerTag = timerTag;
	// request-local game object cache
	this.cache = {};
	// dirty object collector for persistence
	this.dirty = {};
	// objects scheduled for unloading after current request
	this.unload = {};
}


/**
 * Runs a request processing function in its own context, providing
 * request-local persistence and exception handling. Fibers-based
 * functionality can be used anywhere within `func`.
 *
 * If the function finishes successfully, modified game objects that were
 * **explicitly** flagged as dirty are persisted (see
 * {@link RequestContext#setDirty|setDirty}).
 *
 * @param {function} func function to run in request context
 * @param {function} [callback]
 * ```
 * callback(error, result)
 * ```
 * for request processing errors and getting back the function result
 * (if not specified, exceptions will not be caught, and the function
 * result is lost)
 * @param {boolean} [waitPers] if `true`, wait for persistence
 *        operations to finish before invoking callback
 */
RequestContext.prototype.run = function run(func, callback, waitPers) {
	callback = callback || function defaultCallback(err, res) {
		if (err) throw err;
	};
	var rc = this;  // eslint-disable-line consistent-this
	var logtag = util.format('%s/%s', rc.owner, rc.tag);
	var sampleRate = rc.timerTag === 'move_xy' ? 0.1 : undefined;
	wait.launchFiber(function rcFiber() {
		var timer;
		if (rc.timerTag) {
			timer = metrics.createTimer('req.proc.' + rc.timerTag, sampleRate);
		}
		var done = false;
		var res = null;
		try {
			Fiber.current.rc = rc;
			// call function in fiber context
			res = func();
			if (timer) timer.stop();
			log.debug('finished %s (%s dirty)', logtag, Object.keys(rc.dirty).length);
			done = true;
			rc.emit('done');
		}
		catch (err) {
			// trigger prepareStackTrace (parts of the trace might not be
			// available outside the RC)
			err.stack;  // eslint-disable-line no-unused-expressions
			if (!done) rc.emit('done');
			return callback(err);
		}
		// persist modified objects
		if (rc.timerTag) {
			timer = metrics.createTimer('req.pers.' + rc.timerTag, sampleRate);
		}
		pers.postRequestProc(rc.dirty, rc.unload, logtag, function done() {
			if (timer) timer.stop();
			if (waitPers) {
				return callback(null, res);
			}
		});
		// if we don't have to wait for the persistence operations, continue
		// with request context callback right away
		if (!waitPers) {
			return callback(null, res);
		}
	});
};


/**
 * Returns the currently active request context.
 *
 * @param {boolean} [relaxed] if `true`, does **not** throw an Error
 *        when there is no context
 * @returns {RequestContext} the current request context
 * @throws {AssertionError} when called outside a request scope (and
 *         `relaxed` is not `true`)
 *
 * @static
 */
RequestContext.getContext = function getContext(relaxed) {
	if (!relaxed) {
		assert(Fiber.current !== undefined, 'no request context');
	}
	return Fiber.current ? Fiber.current.rc : undefined;
};


/**
 * Flags the given (existing/not newly created) game object as dirty, causing it
 * to be written to persistent storage at the end of the current request. Does
 * nothing when called without an active request context.
 *
 * @param {GameObject} obj the modified game object
 */
RequestContext.setDirty = function setDirty(obj) {
	var rc = RequestContext.getContext(true);
	if (rc) rc.setDirty(obj);
};


/**
 * Explicitly flags the given game object as dirty, causing it to be written to
 * persistent storage at the end of the current request (if the request finishes
 * successfully). Can only be called from within a request (see
 * {@link RequestContext#run|run}).
 *
 * @param {GameObject} obj the new or updated object
 */
RequestContext.prototype.setDirty = function setDirty(obj) {
	this.dirty[obj.tsid] = obj;
};


/**
 * Schedules a game object for unloading from the live object cache at
 * the end of the current request. Can only be called from within a
 * request (see {@link RequestContext#run|run}).
 *
 * @param {GameObject} obj
 */
RequestContext.prototype.setUnload = function setUnload(obj) {
	this.unload[obj.tsid] = obj;
};
