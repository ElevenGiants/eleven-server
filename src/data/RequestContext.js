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
 *
 * @constructor
 */
function RequestContext(logtag, owner) {
	this.logtag = logtag;
	this.owner = owner;
	// request-local game object cache
	this.cache = {};
	// dirty object collector for persistence
	this.dirty = {};
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
 */
RequestContext.prototype.run = function(func, callback) {
	var rc = this;
	wait.launchFiber(function rcFiber() {
		try {
			rc.fiber = Fiber.current;
			rc.fiber.rc = rc;
			// call function in fiber context
			var res = func();
			var tag = util.format('%s/%s/%s', func.name, rc.owner, rc.logtag);
			log.debug('finished %s (%s dirty)', tag, Object.keys(rc.dirty).length);
			// persist modified objects
			pers.processDirtyList(rc.dirty, tag);
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
};


/**
 * Returns the currently active request context.
 *
 * @returns {RequestContext} the current request context
 * @throws {AssertionError} when called outside a request scope
 *
 * @static
 */
RequestContext.getContext = function() {
	assert(Fiber.current !== undefined, 'no request context');
	return Fiber.current.rc;
};


/**
 * Flags the given game object as dirty, causing it to be written to
 * persistent storage at the end of the current request (if the request
 * finishes successfully). Can only be called from within a request
 * (see {@link RequestContext#run|run}).
 *
 * @param {GameObject} obj
 */
RequestContext.prototype.setDirty = function(obj) {
	this.dirty[obj.tsid] = obj;
};
