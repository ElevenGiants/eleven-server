'use strict';

/**
 * Provides functionality to process requests (e.g. from game clients,
 * the HTTP API or remote game servers) within a dedicated context
 * using {@link https://github.com/laverdet/node-fibers|Fibers}.
 * Request handler functions are wrapped in the context with the
 * {@link module:data/requestContext~run|run} function, and can then
 * access request-local data structures through other functions in this
 * module. Additionally, the Fiber context enables all wrapped code to
 * use Fibers-based features like {@link
 * https://github.com/luciotato/waitfor|wait.for}.
 *
 * @module
 */

// public interface
module.exports = {
	getContext: getContext,
	getObjCache: getObjCache,
	objCachePut: objCachePut,
	objCacheGet: objCacheGet,
	setDirty: setDirty,
	run: run,
};


var assert = require('assert');
var util = require('util');
var wait = require('wait.for');
var Fiber = require('wait.for/node_modules/fibers');
var pers = require('data/pers');


/**
 * Returns the currently active request context (i.e. fiber).
 *
 * @returns {Fiber} the current request context
 * @throws {AssertionError} when called outside a request scope
 */
function getContext() {
	assert(Fiber.current !== undefined, 'no request context');
	return Fiber.current;
}


/**
 * Returns the request-local game object cache.
 *
 * @returns {object} the request-local object cache (with TSIDs as keys
 *          and objects as values)
 */
function getObjCache() {
	return getContext().cache;
}


/**
 * Adds a game object to the request-local object cache.
 *
 * @param {GameObject} obj the game object to add
 */
function objCachePut(obj) {
	getContext().cache[obj.tsid] = obj;
}


/**
 * Retrieves a game object from the request-local object cache.
 *
 * @param {string} tsid the unique TSID of the object to fetch
 */
function objCacheGet(tsid) {
	return getContext().cache[tsid];
}


/**
 * Flags the given game object as dirty, causing it to be written to
 * persistent storage at the end of the current request (if the request
 * finishes successfully). Can only be called from within a request
 * (see {@link module:data/requestContext~run|run}).
 *
 * @param {GameObject} obj
 */
function setDirty(obj) {
	getContext().dirty[obj.tsid] = obj;
}


/**
 * Runs a request processing function in its own context, providing
 * request-local persistence and exception handling. Since the context
 * is a fiber, Fibers-based functionality can be used anywhere within
 * the request handler.
 * If the function finishes successfully, any modified game objects are
 * persisted (see {@link module:data/requestContext~setDirty|setDirty}).
 *
 * @param {function} func function to run in request context
 * @param {string} [logtag] short text describing the nature or type of
 *        the request (just for logging)
 * @param {GameObject|string} [owner] game object on whose behalf the
 *        request is executed (commonly a {@link Player}), or its TSID
 *        (just for logging)
 * @param {function} [callback]
 * ```
 * callback(error, result)
 * ```
 * for request processing errors and getting back the function result
 * (if not specified, exceptions will not be caught, and the function
 * result is lost)
 */
function run(func, logtag, owner, callback) {
	wait.launchFiber(function persFiber() {
		try {
			var fiber = getContext();
			// dirty object collector for persistence
			fiber.dirty = {};
			// request-local game object cache
			fiber.cache = {};
			// store optional information (may be useful for error handler)
			fiber.logtag = logtag;
			fiber.owner = owner;
			// call function in fiber context
			var res = func();
			var tag = util.format('%s/%s/%s', func.name, fiber.owner, fiber.logtag);
			log.debug('finished %s (%s dirty)', tag, Object.keys(fiber.dirty).length);
			// persist modified objects
			pers.processDirtyList(fiber.dirty, tag);
			if (typeof callback === 'function') {
				callback(null, res);
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
}
