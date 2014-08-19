/**
 * @module
 */

// public interface
module.exports = {
	makeProxy: makeProxy,
	sendRequest: sendRequest,
	isLocal: isLocal,
	getGsid: getGsid,
};


var assert = require('assert');
var config = require('config');
var rpcProxy = require('data/rpcProxy');
var pers = require('data/pers');
var utils = require('utils');
var util = require('util');


/**
 * Just forwards calls to {@link module:data/rpcProxy~makeProxy|
 * rpcProxy.makeProxy}.
 *
 * @param {GameObject} obj the game object to wrap in RPC proxy
 * @returns {Proxy} wrapped game object
 */
function makeProxy(obj) {
	return rpcProxy.makeProxy(obj);
}


function sendRequest(obj, fname, args) {
	//TODO
}


/**
 * Tests if this game server instance is responsible for a given
 * game object.
 *
 * @param {GameObject} obj the game object to check
 * @returns {boolean} `true` if this is the authoritative server
 *          instance for the given object, `false` otherwise
 */
function isLocal(obj) {
	return getGsid(obj) === config.getGsid();
}


/**
 * Determines the ID of the game server instance responsible for a game
 * object of any type (as opposed to {@link module:config~mapToGS|
 * config.mapToGS}).
 *
 * @param {GameObject|string} objOrTsid the game object to find the
 *        responsible game server for, or its TSID
 * @returns {string} ID of the server managing the object
 */
function getGsid(objOrTsid) {
	// locations and groups mapped by their own tsid
	if (utils.isLoc(objOrTsid) || utils.isGroup(objOrTsid)) {
		return config.mapToGS(objOrTsid).gsid;
	}
	// for all other classes, we need the actual game object
	var obj = typeof objOrTsid === 'string' ? pers.get(objOrTsid) : objOrTsid;
	assert(obj !== undefined, 'cannot map nonexistent game object: ' + objOrTsid);
	// geo mapped by corresponding location
	if (utils.isGeo(obj)) {
		return getGsid(obj.getLocTsid());
	}
	// player mapped by current location
	if (utils.isPlayer(obj)) {
		assert(utils.isLoc(obj.location),
			util.format('invalid location for %s: %s', obj, obj.location));
		return getGsid(obj.location);
	}
	// items (including bags) mapped by their top container (location or player)
	if (utils.isItem(obj)) {
		assert(utils.isLoc(obj.tcont) || utils.isPlayer(obj.tcont),
			util.format('invalid tcont for %s: %s', obj, obj.tcont));
		return getGsid(obj.tcont);
	}
	// quests or DCs mapped by their owner (location, player or group)
	if (utils.isQuest(obj) || utils.isDC(obj)) {
		assert(utils.isLoc(obj.owner) || utils.isPlayer(obj.owner) || utils.isGroup(obj.owner),
			util.format('invalid owner for %s: %s', obj, obj.owner));
		return getGsid(obj.owner);
	}
	throw new Error('invalid game object type: ' + objOrTsid);
}
