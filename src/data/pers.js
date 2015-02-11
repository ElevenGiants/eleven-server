'use strict';

/**
 * Persistence layer, manages loading and saving game objects.
 * A lean persistence back-end module takes care of the actual
 * interaction with a specific storage facility (e.g. files on disk or
 * a database). It must implement the following API:
 * ```
 *     init(config, callback)
 *     close(callback)
 *     read(tsid) -> object
 *     write(obj, callback)
 *     del(obj, callback)
 * ```
 * Where `callback` follows the usual Node conventions (`Error` object
 * or `null` as first parameter, function call results second). The
 * `init` and `close` functions are optional. `read` is expected to
 * return data synchronously; this is due to the fact that the GSJS
 * code was not designed with an asynchronous data store in mind. See
 * e.g. the {@link module:data/pbe/rethink|rethink} module for how to
 * work around this limitation using {@link
 * https://github.com/luciotato/waitfor|wait.for/fibers}.
 *
 * Once loaded, game objects are kept in a cache data structure here,
 * to avoid having to reload them from the back-end for each access.
 * Game logic functions do not need to take care of saving modified
 * objects explicitly; this happens automatically at the end of each
 * request processed through {@link RequestContext#run}, with help of
 * the {@link module:data/persProxy|persProxy} wrapper.
 *
 * @module
 */

// public interface
module.exports = {
	init: init,
	exists: exists,
	get: get,
	create: create,
	postRequestProc: postRequestProc,
	postRequestRollback: postRequestRollback,
};


var assert = require('assert');
var async = require('async');
var gsjsBridge = require('model/gsjsBridge');
var orProxy = require('data/objrefProxy');
var persProxy = require('data/persProxy');
var rpc = require('data/rpc');
var RC = require('data/RequestContext');
var metrics = require('metrics');


// live game object cache
var cache = {};

// persistence back-end
var pbe = null;


/**
 * (Re-)initializes the persistence layer by clearing the live object
 * cache and setting the supplied persistence back-end.
 *
 * @param {object} backEnd persistence back-end module; must implement
 *        the API shown in the above module docs.
 * @param {object} [config] configuration options
 * @param {function} [callback] called when persistence layer is ready,
 *        or an error occurred during initialization
 */
function init(backEnd, config, callback) {
	cache = {};
	pbe = backEnd;
	metrics.setupGaugeInterval('pers.loc.size', function getLocSize() {
		if (!cache) return 0;
		return Object.keys(cache).length;
	});
	if (pbe && typeof pbe.init === 'function') {
		var pbeConfig;
		if (config && config.backEnd) {
			pbeConfig = config.backEnd.config[config.backEnd.module];
		}
		return pbe.init(pbeConfig, callback);
	}
	else if (callback) {
		return callback(null);
	}
}


/**
 * Checks if the persistence layer contains an object with the given
 * TSID, *without actually loading the object*. This should not be used
 * to test if an object exists before reading or writing it
 * (anti-pattern, potential race condition), only for specific cases
 * where it is necessary to perform distinct actions based on the
 * existence of an object.
 *
 * @param {string} tsid TSID to check
 * @returns {boolean} `true` if the object exists, `false` otherwise
 */
function exists(tsid) {
	assert(pbe, 'persistence back-end not set');
	return pbe.read(tsid) !== null;
}


/**
 * Loads the game object with the given TSID from persistence.
 * Depending on whether the GS is "responsible" for this object, it
 * will be wrapped either in a {@link module:data/persProxy|persProxy}
 * or {@link module:data/rpcProxy|rpcProxy}.
 *
 * @param {string} tsid TSID of the object to load
 * @returns {GameObject|null} the requested object, or `null` if no
 *          object data was found for the given TSID
 */
function load(tsid) {
	assert(pbe, 'persistence back-end not set');
	log.debug('pers.load: %s', tsid);
	var data = pbe.read(tsid);
	if (typeof data !== 'object' || data === null) {
		log.info(new Error('dummy error for stack trace'),
			'no or invalid data for %s', tsid);
		return null;
	}
	orProxy.proxify(data);
	var obj = gsjsBridge.create(data);
	if (!rpc.isLocal(obj)) {
		// wrap object in RPC proxy and add it to request cache
		obj = rpc.makeProxy(obj);
		RC.getContext().cache[tsid] = obj;
		metrics.increment('pers.load.remote');
	}
	else {
		// check if object has been loaded in a concurrent request (fiber) in the meantime
		if (tsid in cache) {
			log.warn('%s already loaded, discarding redundant copy', tsid);
			return cache[tsid];
		}
		// make sure any changes to the object are persisted
		obj = persProxy.makeProxy(obj);
		cache[tsid] = obj;
		// resume timers/intervals and send onLoad event if there is a handler
		if (obj.onLoad) {
			obj.onLoad();
		}
		if (obj.resumeGsTimers) {
			obj.resumeGsTimers();
		}
		metrics.increment('pers.load.local');
	}
	metrics.increment('pers.load');
	return obj;
}


/**
 * Retrieves the game object with the given TSID, either from the live
 * object cache or request context cache if available there, or from
 * the persistence back-end.
 *
 * @param {string} tsid TSID of the object to retrieve
 * @param {boolean} [dontWrap] by default, returned objects are wrapped
 *        in a proxy to ensure any access to them is routed through the
 *        persistence layer (to prevent stale objects after rollbacks);
 *        in specific cases where this is not desirable, set this
 *        parameter to `true` to prevent applying the wrapper proxy
 * @returns {GameObject} the requested object
 * @throws {AssertionError} if no object with the given TSID was found
 */
function get(tsid, dontWrap) {
	assert(gsjsBridge.isTsid(tsid), 'not a valid TSID: "' + tsid + '"');
	var ret;
	// get "live" objects from server memory
	if (tsid in cache) {
		ret = cache[tsid];
	}
	else {
		// otherwise, see if we already have it in the request context cache
		var rc = RC.getContext();
		if (tsid in rc.cache) {
			ret = rc.cache[tsid];
		}
		else {
			// if not, actually load the object
			ret = load(tsid);
		}
	}
	// wrap in objref proxy unless specifically asked not to
	if (!dontWrap) {
		ret = orProxy.wrap(ret);
	}
	return ret;
}


/**
 * Creates a new game object of the given type and adds it to
 * persistence. The returned object is wrapped in a ({@link
 * module:data/persProxy|persProxy}) to make sure all future changes
 * to the object are automatically persisted.
 * Also calls the object's GSJS `onCreate` handler, if there is one.
 *
 * @param {function} modelType the desired game object model type (i.e.
 *        a constructor like `Player` or `Geo`)
 * @param {object} [data] additional properties for the object
 * @returns {object} the new object, wrapped in a persistence proxy
 */
function create(modelType, data) {
	log.debug('pers.create: %s%s', modelType.name,
		(typeof data === 'object' && data.tsid) ? ('#' + data.tsid) : '');
	data = data || {};
	var obj = gsjsBridge.create(data, modelType);
	assert(!(obj.tsid in cache), 'object already exists: ' + obj.tsid);
	obj = persProxy.makeProxy(obj);
	cache[obj.tsid] = obj;
	obj = orProxy.wrap(obj);
	RC.getContext().setDirty(obj);
	if (typeof obj.onCreate === 'function') {
		obj.onCreate();
	}
	metrics.increment('pers.create');
	return obj;
}


/**
 * Called by {@link RequestContext#run} after processing a request has
 * finished, writes all resulting game object changes to persistence.
 *
 * @param {object} dlist hash containing the modified game objects
 *        (TSIDs as keys, objects as values)
 * @param {object} ulist hash containing game objects to release from
 *        the live object cache
 * @param {string} [logmsg] optional information for log messages
 * @param {function} [callback] function to be called after persistence
 *        operations have finished
 */
function postRequestProc(dlist, ulist, logmsg, callback) {
	async.each(Object.keys(dlist),
		function iterate(k, iterCallback) {
			var obj = dlist[k];
			try {
				// stop timers/intervals for deleted objects
				if (obj.deleted && obj.suspendGsTimers) {
					obj.suspendGsTimers();
				}
				// perform write or del operation; we're not inside the fiber
				// anymore (due to async), so handle errors carefully here
				var op = obj.deleted ? del : write;
				op(obj, logmsg, function cb(err, res) {
					// silently ignore errors (we're not interested in them here,
					// but we want to call callback when *all* ops have finished)
					iterCallback(null);
				});
			}
			catch (e) {
				log.error(e, 'failed to process %s', obj);
				iterCallback(null);
			}
		},
		function cb() {
			// unload objects scheduled to be released from cache (take care not
			// to load objects here if they are not loaded in the first place)
			for (var k in ulist) {
				var obj = ulist[k];
				try {
					unload(obj);
				}
				catch (e) {
					log.error(e, 'failed to unload %s', obj);
				}
			}
			if (callback) callback();
		}
	);
}


/**
 * Called by {@link RequestContext#run} when an error occured while
 * processing the request. Discards all modifications caused by the
 * request by dropping all tainted objects from the live object cache.
 *
 * @param {object} dlist hash containing the modified game objects
 *        (TSIDs as keys, objects as values)
 * @param {string} [logmsg] optional information for log messages
 * @param {function} [callback] function to be called after rollback
 *        has finished
 */
function postRequestRollback(dlist, logmsg, callback) {
	var tag = 'rollback ' + logmsg;
	log.info(tag);
	for (var k in dlist) {
		unload(dlist[k], tag);
	}
	if (callback) callback();
}


/**
 * Writes a game object to persistent storage.
 *
 * @param {GameObject} obj game object to write
 * @param {string} logmsg short additional info for log messages
 * @param {function} callback called when write operation has finished,
 *        or in case of errors
 * @private
 */
function write(obj, logmsg, callback) {
	log.debug('pers.write: %s%s', obj.tsid, logmsg ? ' (' + logmsg + ')' : '');
	metrics.increment('pers.write');
	pbe.write(orProxy.refify(obj.serialize()), function cb(err, res) {
		if (err) {
			log.error(err, 'could not write: %s', obj.tsid);
			metrics.increment('pers.write.fail');
		}
		if (callback) return callback(err, res);
	});
}


/**
 * Permanently deletes a game object from persistent storage. Also
 * removes the object from the live object cache.
 *
 * @param {GameObject} obj game object to remove
 * @param {string} logmsg short additional info for log messages
 * @param {function} callback called when delete operation has
 *        finished, or in case of errors
 * @private
 */
function del(obj, logmsg, callback) {
	log.debug('pers.del: %s%s', obj.tsid, logmsg ? ' (' + logmsg + ')' : '');
	metrics.increment('pers.del');
	if (obj.suspendGsTimers) obj.suspendGsTimers();
	delete cache[obj.tsid];
	pbe.del(obj, function db(err, res) {
		if (err) {
			log.error(err, 'could not delete: %s', obj.tsid);
			metrics.increment('pers.del.fail');
		}
		if (callback) return callback(err, res);
	});
}


/**
 * Removes a game object from the live object cache. This can not check
 * whether there are still references to the object elsewhere (e.g.
 * pending timers), i.e. it cannot guarantee that memory is eventually
 * freed through garbage collection.
 *
 * @param {GameObject} obj game object to unload
 * @param {string} logmsg short additional info for log messages
 * @private
 */
function unload(obj, logmsg) {
	log.debug('pers.unload: %s%s', obj.tsid, logmsg ? ' (' + logmsg + ')' : '');
	if (obj.tsid in cache) {
		// suspend timers/intervals
		if (obj.suspendGsTimers) obj.suspendGsTimers();
		delete cache[obj.tsid];
	}
}
