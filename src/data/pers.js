'use strict';

/**
 * Persistence layer, manages loading and saving game objects.
 * A lean persistence back-end module takes care of the actual
 * interaction with a specific storage facility (e.g. files on disk or
 * a database). It must implement the following API:
 * ```
 *     init(config, callback)
 *     close(callback)
 *     read(tsid) -> gameObjectData
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
	get: get,
	create: create,
	postRequestProc: postRequestProc,
};


var assert = require('assert');
var async = require('async');
var gsjsBridge = require('model/gsjsBridge');
var orProxy = require('data/objrefProxy');
var persProxy = require('data/persProxy');
var rpc = require('data/rpc');
var RC = require('data/RequestContext');


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
 * @param {object} [config] configuration options for back-end module
 * @param {function} [callback] called when persistence layer is ready,
 *        or an error occurred during initialization
 */
function init(backEnd, config, callback) {
	cache = {};
	pbe = backEnd;
	if (pbe && typeof pbe.init === 'function') {
		return pbe.init(config, callback);
	}
	else if (callback) {
		return callback(null);
	}
}


/**
 * Loads the game object with the given TSID from persistence.
 * Depending on whether the GS is "responsible" for this object, it
 * will be wrapped either in a {@link module:data/persProxy|persProxy}
 * or {@link module:data/rpcProxy|rpcProxy}.
 *
 * @param {string} tsid TSID of the object to load
 * @returns {GameObject} the requested object
 * @throws {AssertionError} if no object with the given TSID was found
 */
function load(tsid) {
	assert(pbe, 'persistence back-end not set');
	log.debug('pers.load: %s', tsid);
	var data;
	data = pbe.read(tsid);
	assert(typeof data === 'object', 'no or invalid data for ' + tsid);
	orProxy.proxify(data);
	var obj = gsjsBridge.create(data);
	if (!rpc.isLocal(obj)) {
		// wrap object in RPC proxy and add it to request cache
		obj = rpc.makeProxy(obj);
		RC.getContext().cache[tsid] = obj;
	}
	else {
		// make sure any changes to the object are persisted
		obj = persProxy.makeProxy(obj);
		// send onLoad event if there is a handler
		if (obj.onLoad) {
			obj.onLoad();
		}
		cache[tsid] = obj;
	}
	return obj;
}


/**
 * Retrieves the game object with the given TSID, either from the live
 * object cache or request cache if available there, or from the
 * persistence back-end.
 *
 * @param {string} tsid TSID of the object to retrieve
 * @returns {GameObject} the requested object
 * @throws {AssertionError} if no object with the given TSID was found
 */
function get(tsid) {
	assert(gsjsBridge.isTsid(tsid), 'not a valid TSID: "' + tsid + '"');
	// get "live" objects from server memory
	if (tsid in cache) {
		return cache[tsid];
	}
	// otherwise, see if we already have it in the request cache
	var rc = RC.getContext();
	if (tsid in rc.cache) {
		return rc.cache[tsid];
	}
	// if not, actually load the object
	return load(tsid);
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
	RC.getContext().setDirty(obj);
	if (typeof obj.onCreate === 'function') {
		obj.onCreate();
	}
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
 * @param {string} logmsg optional information for log messages
 * @param {function} [callback] function to be called after persistence
 *        operations have finished
 */
function postRequestProc(dlist, ulist, logmsg, callback) {
	async.each(Object.keys(dlist),
		function iterate(k, iterCallback) {
			var obj = dlist[k];
			//TODO: stop game object timers/intervals
			/*
			if (obj.deleted || k in ulist) {
				// stop timers/intervals for deleted objects and objects about
				// to be unloaded from cache
			}
			*/
			// perform write or del operation; we're not inside the fiber
			// anymore (due to async), so handle errors carefully here
			var op = obj.deleted ? del : write;
			try {
				op(obj, logmsg, function cb(err, res) {
					// silently ignore errors (we're not interested in them here,
					// but we want to call callback when *all* ops have finished)
					iterCallback(null);
				});
			}
			catch (e) {
				log.error(e, 'failed to %s %s', op.name, obj);
				iterCallback(null);
			}
		},
		function cb() {
			for (var k in ulist) {
				unload(ulist[k]);
			}
			if (callback) callback();
		}
	);
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
	pbe.write(orProxy.refify(obj.serialize()), function cb(err, res) {
		if (err) log.error(err, 'could not write: %s', obj.tsid);
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
	delete cache[obj.tsid];
	pbe.del(obj, function db(err, res) {
		if (err) log.error(err, 'could not delete: %s', obj.tsid);
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
		//TODO: stop game object timers/intervals
		delete cache[obj.tsid];
	}
}
