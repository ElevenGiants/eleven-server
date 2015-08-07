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
	shutdown: shutdown,
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
var DummyError = require('errors').DummyError;


var cache = {};  // live game object cache
var pbe = null;  // persistence back-end
var shuttingDown = false;


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
	shuttingDown = false;
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


function shutdown(done) {
	log.info('persistence layer shutdown initiated');
	shuttingDown = true;
	// first, suspend all timers (so they don't interfere with unloading)
	for (var k in cache) {
		cache[k].suspendGsTimers();
	}
	// then actually unload the objects
	var num = Object.keys(cache).length;
	async.eachLimit(Object.keys(cache), 5, function iter(k, cb) {
		var obj = cache[k];
		delete cache[k];
		write(obj, 'shutdown', cb);
		if (--num % 50 === 0 && num > 0) {
			log.info('persistence layer shutdown: %s objects remaining', num);
		}
	}, function callback() {
		log.info('persistence layer shutdown complete');
		done();
	});
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
		log.info(new DummyError(), 'no or invalid data for %s', tsid);
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
		// post-construction operations (resume timers/intervals, GSJS onLoad etc.)
		if (obj.gsOnLoad) {
			obj.gsOnLoad();
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
	RC.getContext().setDirty(obj, true);
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
 * @param {object} dlist hash containing modified game objects
 *        (TSIDs as keys, objects as values)
 * @param {object} alist hash containing newly added game objects
 * @param {object} ulist hash containing game objects to release from
 *        the live object cache
 * @param {string} [logmsg] optional information for log messages
 * @param {function} [callback] function to be called after persistence
 *        operations have finished
 */
function postRequestProc(dlist, alist, ulist, logmsg, callback) {
	assert(!shuttingDown, 'persistence layer shutdown initiated');
	// process persistence changes in a safe order (add new, then modify
	// existing, then remove deleted objects); this may leave behind orphaned
	// data, but it should at least avoid invalid object references
	async.series([
		postRequestProcStep.bind(undefined, 'add', alist, logmsg),
		postRequestProcStep.bind(undefined, 'upd', dlist, logmsg),
		postRequestProcStep.bind(undefined, 'del', dlist, logmsg),
	], function cb(err) {
		// unload objects scheduled to be released from cache (take care not
		// to load objects here if they are not loaded in the first place)
		for (var k in ulist) {
			try {
				unload(ulist[k]);
			}
			catch (e) {
				log.error(e, 'failed to unload %s', k);
			}
		}
		if (callback) callback(err);
	});
}


/**
 * Helper for `postRequestProc` to process individual operations (add/
 * update/delete objects) separately. This will always try to execute
 * the operation on all given objects, even if some of those operations
 * fail. In case of errors, only the **first** encountered error is
 * passed to the callback.
 *
 * @param {string} step persistence operation (must be `add`, `upd` or
 *         `del`)
 * @param {object} objects hash containing game objects to process
 *        (TSIDs as keys, objects as values)
 * @param {string} logmsg information for log messages
 * @param {function} callback function to be called after persistence
 *        operations have finished
 * @private
 */
function postRequestProcStep(step, objects, logmsg, callback) {
	var err = null;
	async.each(Object.keys(objects),
		function iter(k, cb) {
			var o = objects[k];
			try {
				if (step === 'del') {
					// skip dirty objects that are not actually deleted
					if (!o.deleted) return cb(null);
					// stop timers/intervals for deleted objects
					if (o.suspendGsTimers) o.suspendGsTimers();
					return del(o, logmsg, function (e) {
						if (e && !err) err = e;
						return cb();
					});
				}
				else {
					// skip dirty objects that will be deleted later anyway
					if (o.deleted) return cb(null);
					//if(step == "add")
					//	console.log("adding to pers:" + o.tsid);
					return write(o, logmsg, function (e) {
						if (e && !err) err = e;
						return cb();
					}, true);
				}
			}
			catch (e) {
				log.error(e, 'failed to %s %s', step, o);
				if (!err) err = e;
				return cb();
			}
		},
		function (e, res) {
			callback(err || e, res);
		}
	);
}


/**
 * Called by {@link RequestContext#run} when an error occured while
 * processing the request. Discards all modifications caused by the
 * request by dropping all tainted objects from the live object cache.
 *
 * @param {object} dlist hash containing modified game objects
 *        (TSIDs as keys, objects as values)
 * @param {object} alist hash containing added game objects
 * @param {string} [logmsg] optional information for log messages
 * @param {function} [callback] function to be called after rollback
 *        has finished
 */
function postRequestRollback(dlist, alist, logmsg, callback) {
	assert(!shuttingDown, 'persistence layer shutdown initiated');
	var tag = 'rollback ' + logmsg;
	log.info(tag);
	var k;
	for (k in dlist) {
		unload(dlist[k], tag);
	}
	for (k in alist) {
		unload(alist[k], tag);
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
function write(obj, logmsg, callback, bLog) {
	log.debug('pers.write: %s%s', obj.tsid, logmsg ? ' (' + logmsg + ')' : '');
	metrics.increment('pers.write');
	pbe.write(orProxy.refify(obj.serialize()), function cb(err, res) {
		if (err) {
			log.error(err, 'could not write: %s', obj.tsid);
			metrics.increment('pers.write.fail');
		}
		//if(bLog)
		//	console.log("done writing: " + obj.tsid);
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
	obj.suspendGsTimers();
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
		obj.suspendGsTimers();
		delete cache[obj.tsid];
	}
}
