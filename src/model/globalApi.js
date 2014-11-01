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
 * Retrieves a game object. Throws an Error if no object with the
 * given TSID is found.
 *
 * @param {string} tsid TSID of the desired object
 * @returns {GameObject} the requested object
 */
exports.apiFindObject = function apiFindObject(tsid) {
	log.trace('global.apiFindObject(%s)', tsid);
	return pers.get(tsid);
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
	log.debug('global.apiFindItemPrototype(%s)', classTsid);
	return gsjsBridge.getProto('items', classTsid);
};


exports.apiCallMethodForOnlinePlayers =
	function apiCallMethodForOnlinePlayers(fname, targets) {
	log.debug('%s.apiCallMethodForOnlinePlayers(%s)', this,
		Array.prototype.slice.call(arguments).join(', '));
	//TODO: implement&document me
	log.warn('TODO global.apiCallMethodForOnlinePlayers not implemented yet');
	return {ok: 0, error: 'not implemented'};

};


// dummy for original GS's CPU profiling function
//TODO: remove calls from GSJS code
exports.apiResetThreadCPUClock = function apiResetThreadCPUClock(statName) {
	log.trace('global.apiResetThreadCPUClock(%s)', statName);
};
