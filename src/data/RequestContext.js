'use strict';

module.exports = RequestContext;


var assert = require('assert');
var util = require('util');
var wait = require('wait.for');
var Fiber = require('wait.for/node_modules/fibers');
var pers = require('data/pers');


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
 * @param {string} [logtag] short text describing the nature or type of
 *        the request (just for logging)
 * @param {GameObject|string} [owner] game object on whose behalf the
 *        request is executed (commonly a {@link Player}), or its TSID
 *        (just for logging)
 * @param {Session} [session] client session where the request
 *        originated (if applicable)
 *
 * @constructor
 */
function RequestContext(logtag, owner, session) {
	this.logtag = logtag;
	this.owner = owner;
	this.session = session;
	// request-local game object cache
	this.cache = {};
	// dirty object collector for persistence
	this.dirty = {};
	// objects scheduled for unloading after current request
	this.unload = {};
	// post-request-and-persistence callback (see setPostPersCallback)
	this.postPersCallback = null;
}


/**
 * Runs a request processing function in its own context, providing
 * request-local persistence and exception handling. Fibers-based
 * functionality can be used anywhere within `func`.
 *
 * If the function finishes successfully, any modified game objects are
 * persisted (see {@link RequestContext#setDirty|setDirty}).
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
	//jscs:disable safeContextKeyword
	var rc = this;
	//jscs:enable safeContextKeyword
	wait.launchFiber(function rcFiber() {
		try {
			rc.fiber = Fiber.current;
			rc.fiber.rc = rc;
			// call function in fiber context
			var res = func();
			var tag = util.format('%s/%s/%s', func.name, rc.owner, rc.logtag);
			log.debug('finished %s (%s dirty)', tag, Object.keys(rc.dirty).length);
			// persist modified objects
			pers.postRequestProc(rc.dirty, rc.unload, tag, function done() {
				// invoke special post-persistence callback if there is one
				if (typeof rc.postPersCallback === 'function') {
					rc.postPersCallback();
				}
				// continue with "regular" request context callback
				if (waitPers && typeof callback === 'function') {
					return callback(null, res);
				}
			});
			// if we don't have to wait for the persistence operations, continue
			// with request context callback right away
			if (!waitPers && typeof callback === 'function') {
				return callback(null, res);
			}
		}
		catch (e) {
			// TODO: nothing is rolled back, so the modified objects might
			// still be persisted eventually through other calls; i.e. we could
			// just as well persist them here? Or should we rather roll back
			// any changes on failure?
			if (typeof callback === 'function') {
				callback(e);
			}
			else {
				throw e;
			}
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
 * Class method for serializing the `rc` field in bunyan log calls.
 *
 * @see {@link https://github.com/trentm/node-bunyan#serializers}
 * @static
 * @private
 */
RequestContext.logSerialize = function logSerialize(rc) {
	var ret = {};
	if (rc.logtag) ret.logtag = rc.logtag;
	if (rc.owner) ret.owner = '' + rc.owner;
	return ret;
};


/**
 * Flags the given game object as dirty, causing it to be written to
 * persistent storage at the end of the current request (if the request
 * finishes successfully). Can only be called from within a request
 * (see {@link RequestContext#run|run}).
 *
 * @param {GameObject} obj
 */
RequestContext.prototype.setDirty = function setDirty(obj) {
	this.dirty[obj.tsid] = obj;
};


/**
 * Schedules a game object for unloading from the live object cache at
 * the end of the current request. Can only be called from within a
 * request (see {@link RequestContext#run|run}). This includes {@link
 * RequestContext#setDirty|setDirty}.
 *
 * @param {GameObject} obj
 */
RequestContext.prototype.setUnload = function setUnload(obj) {
	this.setDirty(obj);  // make sure last state is persisted
	this.unload[obj.tsid] = obj;
};


/**
 * Schedules a function to be called after a request has been processed
 * successfully, **and** the resulting changes have been written to
 * persistence. If request processing fails, the function will not be
 * called.
 *
 * @param {function} callback called after request processing and the
 *        resulting persistence; no arguments
 */
RequestContext.prototype.setPostPersCallback = function setPostPersCallback(callback) {
	this.postPersCallback = callback;
};
