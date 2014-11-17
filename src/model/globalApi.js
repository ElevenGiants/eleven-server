'use strict';

/**
 * Global model layer API functions (used by GSJS code).
 *
 * @module
 */

var gsjsBridge = require('model/gsjsBridge');
var DataContainer = require('model/DataContainer');
var Item = require('model/Item');
var Bag = require('model/Bag');
var pers = require('data/pers');
var orProxy = require('data/objrefProxy');
var lodash = require('lodash');


function getItemType(classTsid) {
	return (classTsid.substr(0, 4) === 'bag_') ? Bag : Item;
}


exports.toString = function toString() {
	return 'globalApi';
};


/**
 * Creates a new data container object assigned to a specific owner.
 *
 * @param {Location|Player|Group} owner of the DC object
 * @returns {DataContainer} the new object
 */
exports.apiNewOwnedDC = function apiNewOwnedDC(owner) {
	log.debug('global.apiNewOwnedDC(%s)', owner);
	return DataContainer.create(owner);
};


/**
 * Creates a new item (or bag) with the given class.
 *
 * @param {string} classTsid ID of the desired item class
 * @returns {Item|Bag} the new object
 */
exports.apiNewItem = function apiNewItem(classTsid) {
	log.trace('global.apiNewItem(%s, %s)', classTsid);
	return getItemType(classTsid).create(classTsid);
};


/**
 * Creates a new stack of a specific item class.
 *
 * @param {string} classTsid ID of the desired item class
 * @param {number} count item stack amount (must be a positive integer)
 * @returns {Item} the new object
 */
exports.apiNewItemStack = function apiNewItemStack(classTsid, count) {
	log.trace('global.apiNewItemStack(%s, %s)', classTsid, count);
	return getItemType(classTsid).create(classTsid, count);
};


/**
 * Retrieves a game object.
 *
 * @param {string} tsid TSID of the desired object
 * @returns {GameObject|null} the requested object, or `null` if no
 *          object found for the given TSID
 */
exports.apiFindObject = function apiFindObject(tsid) {
	log.trace('global.apiFindObject(%s)', tsid);
	// GSJS code is calling this with invalid TSID, but does not expect it to
	// throw (e.g. in groups/hi_variants_tracker.reset)
	var ret = null;
	if (gsjsBridge.isTsid(tsid)) {
		ret = pers.get(tsid);
	}
	return ret;
};


/**
 * Checks if a player is currently online/in-game.
 *
 * @param {string} tsid player TSID
 * @returns {boolean} `true` if the player is online
 */
exports.apiIsPlayerOnline = function apiIsPlayerOnline(tsid) {
	log.debug('global.apiIsPlayerOnline(%s)', tsid);
	//TODO: implement me
	log.warn('TODO global.apiIsPlayerOnline not implemented yet');
	return false;
};


/**
 * Stores a record with an arbitrary number of fields in a dedicated
 * game activity log.
 *
 */
//TODO: append next line to jsdocs when this is fixed: <https://github.com/jscs-dev/jscs-jsdoc/issues/35>
// * @param {...string} field log record field like `"key=somevalue"`
exports.apiLogAction = function apiLogAction() {
	log.debug('global.apiLogAction(%s)',
		Array.prototype.slice.call(arguments).join(', '));
	//TODO: implement me
	log.warn('TODO global.apiLogAction not implemented yet');
};


/**
 * Retrieves the prototype for an item class.
 *
 * @param {string} classTsid ID of the desired item class
 * @returns {object} the prototype object
 */
exports.apiFindItemPrototype = function apiFindItemPrototype(classTsid) {
	log.trace('global.apiFindItemPrototype(%s)', classTsid);
	return gsjsBridge.getProto('items', classTsid);
};


/**
 * Retrieves the prototype for a quest class.
 *
 * @param {string} classTsid ID of the desired quest class
 * @returns {object} the prototype object
 */
exports.apiFindQuestPrototype = function apiFindQuestPrototype(classTsid) {
	log.debug('global.apiFindQuestPrototype(%s)', classTsid);
	return gsjsBridge.getProto('quests', classTsid);
};


/**
 * Retrieves a game object prototype by path.
 *
 * @param {string} path file system path of the desired game object
 *        prototype (relative to the GSJS root directory)
 * @returns {object} the prototype object
 */
exports.apiGetJSFileObject = function apiGetJSFileObject(path) {
	log.debug('global.apiGetJSFileObject(%s)', path);
	if (path.slice(-3).toLowerCase() === '.js') {
		path = path.slice(0, -3);
	}
	return gsjsBridge.getProto.apply(gsjsBridge, path.split('/'));
};


exports.apiCallMethod = function apiCallMethod(fname, targets) {
	log.debug('%s.apiCallMethod(%s)', this,
		Array.prototype.slice.call(arguments).join(', '));
	//TODO: implement&document me
	log.warn('TODO global.apiCallMethod not implemented yet');
	var ret = {};
	for (var tsid in targets) {
		ret[tsid] = {ok: 0, offline: true};
	}
	return ret;
};


exports.apiCallMethodForOnlinePlayers =
	function apiCallMethodForOnlinePlayers(fname, targets) {
	log.debug('%s.apiCallMethodForOnlinePlayers(%s)', this,
		Array.prototype.slice.call(arguments).join(', '));
	//TODO: implement&document me
	log.warn('TODO global.apiCallMethodForOnlinePlayers not implemented yet');
	var ret = {};
	for (var tsid in targets) {
		ret[tsid] = {ok: 0, offline: true};
	}
	return ret;

};


/**
 * Creates a deep copy of an object, copying all direct properties
 * (i.e. those not inherited from a prototype). Can deal with circular
 * references. {@link module:data/objrefProxy|Objref proxies} are not
 * resolved in the process.
 *
 * @param {object} obj object to copy
 * @returns {object} copy of the given object
 */
exports.apiCopyHash = function apiCopyHash(obj) {
	log.trace('global.apiCopyHash');
	var ret = lodash.clone(obj, true, function handleObjRefs(val) {
		if (typeof val === 'object' && val !== null && val.__isORP) {
			return orProxy.refify(val);
		}
	});
	orProxy.proxify(ret);
	return ret;
};


exports.apiSendToAll = function apiSendToAll(msg) {
	log.debug('global.apiSendToAll(%s)', msg);
	log.warn('TODO global.apiSendToAll not implemented yet');
	//TODO: implement&document me
};


exports.apiSendToGroup = function apiSendToGroup(msg, targets) {
	log.debug('global.apiSendToGroup(%s, %s)', msg, targets);
	log.warn('TODO global.apiSendToGroup not implemented yet');
	//TODO: implement&document me
};


exports.apiAsyncHttpCall = function apiAsyncHttpCall(url, header, postParams, tsid) {
	log.debug('global.apiAsyncHttpCall(%s, %s, %s, %s)', url, header, postParams, tsid);
	log.warn('TODO global.apiAsyncHttpCall not implemented yet');
	//TODO: implement&document me
};


// dummy for original GS's CPU profiling function
//TODO: remove calls from GSJS code
exports.apiResetThreadCPUClock = function apiResetThreadCPUClock(statName) {
	log.trace('global.apiResetThreadCPUClock(%s)', statName);
};
