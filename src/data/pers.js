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
 *     write(objects, callback)
 *     del(tsid, callback)
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
	get: get,
	view: view,
	create: create,
	registerProxy: registerProxy,
	postRequestProc: postRequestProc,
	clearStaleRefs: clearStaleRefs,
	extract: extract,
};


var _ = require('lodash');
var assert = require('assert');
var async = require('async');
var gsjsBridge = require('model/gsjsBridge');
var orProxy = require('data/objrefProxy');
var rpc = require('data/rpc');
var RC = require('data/RequestContext');
var metrics = require('metrics');
var DummyError = require('errors').DummyError;
var utils = require('utils');


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
	if (pbe && _.isFunction(pbe.init)) {
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
		write([k], 'shutdown', cb);
		if (--num % 50 === 0 && num > 0) {
			log.info('persistence layer shutdown: %s objects remaining', num);
		}
	}, function callback() {
		log.info('persistence layer shutdown complete');
		done();
	});
}


/**
 * Loads a COPY of the game object with the given TSID from persistence.
 * This object will not be stored in cache, nor will any timers be run. This
 * function exists purely to get information from persisted objects.
 *
 * @param {string} tsid TSID of the object to load
 * @returns {Object|null} the requested object, or `null` if no
 *          object data was found for the given TSID
 */
function view(tsid) {
	assert(pbe, 'persistence back-end not set');
	return pbe.read(tsid);
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
	if (data === null && (utils.isGeo(tsid) || utils.isLoc(tsid))) {
		log.info('no data for %s, using temp location data instead', tsid);
		data = pbe.read(utils.isGeo(tsid) ? 'GKZ8WU4WGMQME7CXXX' : 'LKZ8WU4WGMQME7CXXX');
		if (data) data.tsid = tsid;
	}
	if (!_.isObject(data)) {
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
		try {
			if (obj.gsOnLoad) obj.gsOnLoad();
		}
		catch (err) {
			log.error(err, 'failed to process onLoad event');
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
 * @param {boolean} [upsert] when `true`, allows replacing existing objects
 * @returns {object} the new object, wrapped in a persistence proxy
 */
function create(modelType, data, upsert) {
	log.debug('pers.create: %s%s', modelType.name,
		_.isObject(data) && data.tsid ? '#' + data.tsid : '');
	data = data || {};
	var obj = gsjsBridge.create(data, modelType);
	if (!upsert) {
		assert(!(obj.tsid in cache), 'object already exists: ' + obj.tsid);
	}
	cache[obj.tsid] = obj;
	RC.getContext().setDirty(obj);
	obj.gsOnCreate();
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
		if (!(k in cache)) continue;
		if (utils.isPlayer(k) || utils.isLoc(k) || utils.isGroup(k)) {
			utsids = utsids.concat(getLoadedRefs(cache[k]));
		}
		else {
			utsids = utsids.concat(k);
		}
	}
	if (!dtsids.length && !utsids.length) {
		return callback ? callback(null) : undefined;
	}
	utsids = _.uniq(utsids);
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
 * Helper for `postRequestProc` to process individual operations (write/delete
 * objects) separately.
 *
 * @param {string} step persistence operation (must be `write` or `delete`)
 * @param {array} tsids list of TSIDs of game objects to process
 * @param {string} logmsg information for log messages
 * @param {function} callback function to be called after persistence
 *        operations have finished
 * @private
 */
function postRequestProcStep(step, tsids, logmsg, callback) {
	tsids = _.filter(tsids, (tsid) => tsid in cache);
	var delOp = step === 'delete';
	tsids = _.filter(tsids, (i) => delOp ? cache[i].deleted : !cache[i].deleted);
	if (!tsids.length) return callback();
	return (delOp ? del : write)(tsids, logmsg, callback);
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
		if (!_.isObject(v)) continue;
		// skip references to game objects that are not currently loaded
		if (v.__isORP) continue;
		// skip if this is not one of the game object types we need to pick up
		var isGO = _.isString(v.tsid) && v.tsid.length;
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
 * Clear missing references from a list (array or object) in a game object.
 * This is a hack/workaround; those references should really have been removed
 * when the referenced objects were deleted.
 *
 * @param {GameObject} obj object to check/clean up
 * @param {string} path property path (may be nested, dot-separated) to the
 *        array/hash containing references to check
 */
function clearStaleRefs(obj, path) {
	log.debug('clearing stale refs for %s.%s', obj. path);
	var refs = _.get(obj, path);
	var keys = _.keys(refs);
	for (var i = keys.length - 1; i >= 0; i--) {
		var k = keys[i];
		var tsid = _.isObject(refs[k]) ? refs[k].tsid : null;
		if (!tsid || !get(tsid, true)) {
			log.warn('removing broken ref %s from %s.%s', tsid, obj, path);
			if (_.isArray(refs)) refs.splice(i, 1);
			else delete refs[k];
		}
	}
}


/**
 * Writes game objects to persistent storage.
 *
 * @param {array} tsids IDs of the game objects to write
 * @param {string} logmsg short additional info for log messages
 * @param {function} callback called when write operation has finished,
 *        or in case of errors
 * @private
 */
function write(tsids, logtag, callback) {
	var n = tsids.length;
	log.debug({n, tsids, logtag}, 'pers.write');
	metrics.count('pers.write', n);
	var data = [];
	var err;
	for (var i = 0; i < tsids.length; i++) {
		try {
			data.push(orProxy.refify(cache[tsids[i]].serialize()));
		}
		catch (e) {
			log.error(e, 'failed to serialize %s', tsids[i]);
			err = err || e;
		}
	}
	return pbe.write(data, (e) => {
		if (err) {
			log.error({err, logtag}, 'pers.write failed');
			metrics.count('pers.write.fail', n);
		}
		return callback(e || err);
	});
}



/**
 * Permanently deletes game objects from persistent storage and removes them
 * from the live object cache.
 *
 * @param {array} list of TSIDs to remove
 * @param {string} logtag short additional info for log messages
 * @param {function} callback called when delete operation has finished, or in
 *        case of errors
 * @private
 */
function del(tsids, logtag, callback) {
	var n = tsids.length;
	log.info({n, tsids, logtag}, 'pers.del');
	metrics.count('pers.del', n);
	async.each(tsids, function iter(tsid, cb) {
		if (tsid in cache) {
			cache[tsid].suspendGsTimers();
			delete cache[tsid];
		}
		if (tsid in proxyCache) {
			delete proxyCache[tsid];
		}
		pbe.del(tsid, (err) => {
			if (err) {
				log.error(err, 'could not delete: %s', tsid);
				metrics.increment('pers.del.fail');
			}
			return cb();
		});
	}, callback);
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
		// check to see if the player is gs moving and send the relevant
		// messages if they are.
		if (cache[tsid].sendGsMoveMsg) cache[tsid].sendGsMoveMsg();
		// suspend timers/intervals
		cache[tsid].suspendGsTimers();
		delete cache[tsid];
	}
}


/**
 * Returns an array of objects containing the non-proxied data
 * for the passed in tsid and all referenced objects if
 * desired.
 *
 * @param {tsid} tsid tsid of the game object to extract
 * @param {bool} includeRefs if true, extract referenced objects
 * @returns {array} includes an array of the requested object
 * 		and referenced objects if requested
 * @private
 */
function extract(tsid, includeRefs, ret) {
	assert(pbe, 'persistence back-end not set');
	log.debug('pers.extract: %s', tsid);

	var checkRecurse = function checkRecurse(obj) {
		// skip non-object properties
		if (!_.isObject(obj)) return;
		// skip if this is not one of the game object types we need to pick up
		var isGO = _.isString(obj.tsid) && obj.tsid.length;
		var type = isGO ? obj.tsid[0] : null;
		if (isGO && type !== 'P' && type !== 'Q') {
			extract(obj.tsid, false, ret);
		}
	};

	ret = ret || [];
	var dataObj = get(tsid);
	var data = orProxy.refify(dataObj.serialize ? dataObj.serialize() : dataObj);
	if (!_.isObject(data)) {
		log.info(new DummyError(), 'no or invalid data for %s', tsid);
		return ret;
	}
	ret.push(data);
	if (utils.isLoc(tsid)) {
		extract('G' + tsid.slice(1), false, ret);
	}
	if (includeRefs) {
		for (var k in data) {
			// optimization: don't follow well-known "parent" references
			if (k === 'owner' || k === 'container' || k === 'location') continue;
			var v = data[k];
			// recurse through arrays
			if (_.isArray(v)) {
				for (var i = 0; i < v.length; i++) {
					checkRecurse(v[i]);
				}
			}
			checkRecurse(v);
		}
	}
	return ret;
}
