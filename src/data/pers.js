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
	registerProxy: registerProxy,
	postRequestProc: postRequestProc,
};


var assert = require('assert');
var async = require('async');
var lodash = require('lodash');
var gsjsBridge = require('model/gsjsBridge');
var orProxy = require('data/objrefProxy');
var rpc = require('data/rpc');
var RC = require('data/RequestContext');
var metrics = require('metrics');
var DummyError = require('errors').DummyError;


// live game object cache
var cache = {};
// game object proxy cache
var proxyCache = {};
// persistence back-end
var pbe = null;
// shutdown in progress flag
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
	proxyCache = {};
	pbe = backEnd;
	shuttingDown = false;
	metrics.setupGaugeInterval('pers.loc.size', function getLocSize() {
		return cache ? Object.keys(cache).length : 0;
	});
	metrics.setupGaugeInterval('pers.poc.size', function getPocSize() {
		return proxyCache ? Object.keys(proxyCache).length : 0;
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
	// first, suspend all timers to avoid interference
	for (var k in cache) {
		cache[k].suspendGsTimers();
	}
	// then actually write the objects
	var num = Object.keys(cache).length;
	async.eachLimit(Object.keys(cache), 5, function iter(k, cb) {
		if (!cache[k]) {
			log.debug('%s already unloaded through its container/owner', k);
			return cb();
		}
		write(cache[k], 'shutdown', cb);
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
 * may be wrapped in an {@link module:data/rpcProxy|rpcProxy}.
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
 * Creates and caches a proxy wrapper for a game object reference,
 * which can subsequently be returned in {@link module:data/pers~get|
 * get} in order to only load the referenced object when actually
 * necessary.
 *
 * @param {object} objref a game object reference (see {@link
 *        module:data/objrefProxy|objrefProxy})
 */
function registerProxy(objref) {
	if (!(objref.tsid in cache || objref.tsid in proxyCache)) {
		proxyCache[objref.tsid] = orProxy.makeProxy(objref);
	}
}


/**
 * Retrieves the game object with the given TSID. If this is the
 * authoritative GS instance for the object, returns the object itself
 * (loading it from the persistence back-end if necessary), or an
 * objref proxy wrapper (depending on the `noProxy` argument).
 * Otherwise, an RPC proxy is returned.
 *
 * @param {string} tsid TSID of the object to retrieve
 * @param {boolean} [noProxy] if `true`, the returned object **must**
 *        be the actual `GameObject` instance; otherwise, an objref
 *        proxy wrapper may be returned if that object has not been
 *        loaded yet (irrelevant if this is not the authoritative GS)
 * @returns {GameObject} the requested object
 * @throws {AssertionError} if no object with the given TSID was found
 */
function get(tsid, noProxy) {
	assert(gsjsBridge.isTsid(tsid), 'not a valid TSID: "' + tsid + '"');
	var ret;
	// get "live" objects from server memory
	if (tsid in cache) {
		ret = cache[tsid];
	}
	// or just a proxy if that's enough
	else if (!noProxy && tsid in proxyCache) {
		ret = proxyCache[tsid];
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
	return ret;
}


/**
 * Creates a new game object of the given type. Also calls the object's
 * GSJS `onCreate` handler, if there is one.
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
	cache[obj.tsid] = obj;
	RC.getContext().setDirty(obj);
	if (typeof obj.onCreate === 'function') {
		obj.onCreate();
	}
	metrics.increment('pers.create');
	return obj;
}


/**
 * Called by {@link RequestContext#run} after processing a request has finished;
 * writes object additions and deletions to persistence, and persists and
 * unloads game objects and connected "child" objects that this GS worker is
 * not managing anymore after the request (e.g. in case of player movement to
 * another server).
 *
 * @param {object} dlist hash with added or deleted game objects to persist
 * @param {object} ulist hash containing game objects to persist and release
 *        from the live object cache
 * @param {string} [logmsg] optional information for log messages
 * @param {function} [callback] function to be called after persistence
 *        operations have finished
 */
function postRequestProc(dlist, ulist, logmsg, callback) {
	if (shuttingDown) {
		var e = new Error('no more persistence operations allowed (shutdown)');
		log.error({err: e}, 'failed to persist %s request', logmsg);
		if (callback) return callback(e);
	}
	var dtsids = Object.keys(dlist);
	var utsids = [];
	for (var k in ulist) {
		if (k in cache) {
			utsids = utsids.concat(getLoadedRefs(cache[k]));
		}
	}
	if (!dtsids.length && !utsids.length) {
		return callback ? callback(null) : undefined;
	}
	utsids = lodash.uniq(utsids);
	log.trace('objects to release after %s request: %s', logmsg, utsids);
	// process persistence changes in a safe order (add/modify first, then
	// delete); this may leave behind orphaned data, but should at least avoid
	// invalid object references
	async.series([
		postRequestProcStep.bind(undefined, 'write', dtsids, logmsg),
		postRequestProcStep.bind(undefined, 'write', utsids, logmsg),
		postRequestProcStep.bind(undefined, 'delete', utsids, logmsg),
		postRequestProcStep.bind(undefined, 'delete', dtsids, logmsg),
	], function cb(err) {
		// unload objects scheduled to be released from cache (take care not
		// to load objects here if they are not loaded in the first place)
		for (var i = 0; i < utsids.length; i++) {
			try {
				unload(utsids[i]);
			}
			catch (e) {
				log.error(e, 'failed to unload %s', utsids[i]);
			}
		}
		if (callback) return callback(err);
	});
}


/**
 * Helper for `postRequestProc` to process individual operations
 * write/delete objects) separately. This will always try to execute
 * the operation on all given objects, even if some of those operations
 * fail. In case of errors, only the **first** encountered error is
 * passed to the callback.
 *
 * @param {string} step persistence operation (must be `write` or
 *         `delete`)
 * @param {array} tsids list of tsids of game objects to process
 * @param {string} logmsg information for log messages
 * @param {function} callback function to be called after persistence
 *        operations have finished
 * @private
 */
function postRequestProcStep(step, tsids, logmsg, callback) {
	var err = null;
	async.each(tsids,
		function iter(tsid, cb) {
			// skip if not a "live" object in the first place
			if (!(tsid in cache)) return cb();
			var o = cache[tsid];
			try {
				if (step === 'delete') {
					// skip objects that are not actually deleted
					if (!o.deleted) return cb();
					return del(o, logmsg, function (e) {
						if (e && !err) err = e;
						return cb();
					});
				}
				else {
					// skip objects that will be deleted later anyway
					if (o.deleted) return cb();
					return write(o, logmsg, function (e) {
						if (e && !err) err = e;
						return cb();
					});
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
 * Recursively collects references to dependent objects (items/bags, data
 * containers, quests) within a "parent" game object (location, group, player).
 *
 * @param {GameObject} obj object to retrieve referenced "child" objects for
 * @param {GameObject} [root] for internal use
 * @param {array} [ret] for internal use
 * @returns {array} the list of game objects referenced in `obj` (i.e. a
 *          "self-contained object graph" that should be safe to release
 *          from the live object cache when the root object is unloaded)
 */
function getLoadedRefs(obj, root, ret) {
	root = root || obj;
	ret = ret || [obj.tsid];
	for (var k in obj) {
		// optimization: don't follow well-known "parent" references
		if (k === 'owner' || k === 'container' || k === 'location') continue;
		var v = obj[k];
		// skip non-object properties
		if (typeof v !== 'object' || v === null) continue;
		// skip references to game objects that are not currently loaded
		if (v.__isORP) continue;
		// skip if this is not one of the game object types we need to pick up
		var isGO = v.tsid && typeof v.tsid === 'string' && v.tsid.length;
		var type = isGO ? v.tsid[0] : null;
		if (isGO && type !== 'B' && type !== 'I' && type !== 'D' && type !== 'Q') {
			continue;
		}
		// otherwise, pick up (if it's a game object)
		if (isGO) {
			if (ret.indexOf(v.tsid) !== -1) {
				log.warn('unexpected objref cycle detected: %s in %s',
					v.tsid, root.tsid);
				continue;
			}
			ret.push(v.tsid);
		}
		// and follow the reference
		getLoadedRefs(v, root, ret);
	}
	if (obj === root) {
		log.trace('loaded referenced objects for %s: %s', root.tsid, ret);
	}
	return ret;
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
	var cb = function cb(err, res) {
		if (err) {
			log.error(err, 'could not write: %s', obj.tsid);
			metrics.increment('pers.write.fail');
		}
		if (callback) return callback(err, err ? null : res);
	};
	var ser;
	try {
		ser = obj.serialize();
	}
	catch (e) {
		return cb(e);

	}
	pbe.write(orProxy.refify(ser), cb);
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
	if (obj.tsid in cache) {
		obj.suspendGsTimers();
		delete cache[obj.tsid];
	}
	if (obj.tsid in proxyCache) {
		delete proxyCache[obj.tsid];
	}
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
 * @param {tsid} tsid tsid of the game object to unload
 * @param {string} logmsg short additional info for log messages
 * @private
 */
function unload(tsid, logmsg) {
	log.debug('pers.unload: %s%s', tsid, logmsg ? ' (' + logmsg + ')' : '');
	if (tsid in cache) {
		// suspend timers/intervals
		cache[tsid].suspendGsTimers();
		delete cache[tsid];
	}
	if (tsid in proxyCache) {
		delete proxyCache[tsid];
	}
}
