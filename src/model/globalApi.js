'use strict';

/**
 * Global model layer API functions (used by GSJS code).
 *
 * @module
 */

var assert = require('assert');
var gsjsBridge = require('model/gsjsBridge');
var Property = require('model/Property');
var OrderedHash = require('model/OrderedHash');
var DataContainer = require('model/DataContainer');
var Quest = require('model/Quest');
var Item = require('model/Item');
var Bag = require('model/Bag');
var Group = require('model/Group');
var GameObject = require('model/GameObject');
var config = require('config');
var rpc = require('data/rpc');
var sessionMgr = require('comm/sessionMgr');
var pers = require('data/pers');
var orProxy = require('data/objrefProxy');
var utils = require('utils');
var logging = require('logging');
var lodash = require('lodash');
var slackChat = require('comm/slackChat');
var crypto = require('crypto');


function getItemType(classTsid) {
	return (classTsid.substr(0, 4) === 'bag_') ? Bag : Item;
}


function isPlayerOnline(tsid) {
	var p = pers.get(tsid);
	return p !== undefined && p.isConnected();
}


/**
 * Creates a deep copy of an object, copying only direct properties
 * and not following objref proxies in the process.
 *
 * @param {object} obj object to copy
 * @returns {object} copy of the given object
 */
function safeClone(obj) {
	var ret = lodash.clone(obj, true, function handleObjRefs(val) {
		if (typeof val === 'object' && val !== null && val.__isORP) {
			return orProxy.refify(val);
		}
	});
	orProxy.proxify(ret);
	return ret;
}

/**
 * Creates a copy of a Geo object
 *
 * @param {object} obj Geo to copy
 * @returns {object} copy of the given object
 */
function geoCopy(obj) {
	var ret = {};
	GameObject.prototype.copyProps.call(ret, obj);
	return ret;
}


/**
 * Calls a method for each game object in a given list.
 *
 * @param {string} fname name of the function to call for each object
 * @param {string[]|object} targets a list of TSIDs or an object with
 *        TSIDs as keys
 * @param {array} args list of arguments for the called function
 * @param {boolean} [onlineOnly] only apply the function to players who
 *        are currently online (the given TSIDs must only refer to
 *        player objects in this case)
 * @returns {object} a hash with TSIDs as keys and values representing
 *          the function call results as follows:
 *          <ul>
 *            <li>`{ok: 0, error: <error object>}` if an error occurred
 *              while calling the function</li>
 *            <li>`{ok: 0, offline: true}` if the respective player is
 *              not currently online (only possible when `onlineOnly`
 *              is `true`)</li>
 *            <li>`{ok: 1, res: <return value>}` if the call was
 *              successful and returned a primitive value</li>
 *            <li>`{ok: 1, <properties of return value...>}` if the
 *              call was successful and returned an object</li>
 *          </ul>
 */
function callFor(fname, targets, args, onlineOnly) {
	//TODO: this is currently not making the function calls in parallel (as
	// described in the GSJS docs), and not applying a timeout on the calls either
	assert(args === undefined || args instanceof Array, 'when specified, ' +
		'args needs to be an array');
	var tsids = utils.gameObjArgToList(targets, onlineOnly ? utils.isPlayer : null);
	var ret = {};
	for (var i = 0; i < tsids.length; i++) {
		var tsid = tsids[i];
		if (onlineOnly && !isPlayerOnline(tsid)) {
			ret[tsid] = {ok: 0, offline: true};
			continue;
		}
		try {
			var obj = pers.get(tsid);
			var res = obj[fname].apply(obj, args);
			ret[tsid] = (typeof res !== 'object' || res === null) ? {res: res} : res;
			ret[tsid].ok = 1;
		}
		catch (e) {
			ret[tsid] = {ok: 0, error: e};
		}
	}
	return ret;
}


exports.toString = function toString() {
	return 'globalApi';
};


/**
 * Creates a new property object.
 *
 * @param {string} name property name
 * @param {number} value initial value
 * @returns {Property} the new property
 */
exports.apiNewProperty = function apiNewProperty(name, value) {
	log.debug('global.apiNewProperty(%s, %s)', name, value);
	return new Property(name, value);
};


/**
 * Create a new ordered hash object.
 *
 * @returns {OrderedHash} the new ordered hash
 */
exports.apiNewOrderedHash = function apiNewOrderedHash() {
	log.debug('global.apiNewOrderedHash()');
	return new OrderedHash();
};


/**
 * Creates a new data container object assigned to a specific owner.
 *
 * @param {Location|Player|Group} owner owner of the DC object
 * @returns {DataContainer} the new object
 */
exports.apiNewOwnedDC = function apiNewOwnedDC(owner) {
	log.debug('global.apiNewOwnedDC(%s)', owner);
	return DataContainer.create(owner);
};


/**
 * Creates a new quest object assigned to a specific owner.
 *
 * @param {string} classTsid specific class of the quest
 * @param {Location|Player} owner owner of the quest object
 * @returns {Quest} the new object
 */
exports.apiNewOwnedQuest = function apiNewOwnedQuest(classTsid, owner) {
	log.debug('global.apiNewOwnedQuest(%s, %s)', classTsid, owner);
	return Quest.create(classTsid, owner);
};


/**
 * Creates a new group object.
 *
 * @param {string} classTsid specific class of the group
 * @returns {Group} the new group
 */
exports.apiNewGroup = function apiNewGroup(classTsid) {
	log.debug('global.apiNewGroup(%s)', classTsid);
	return Group.create(classTsid);
};


/**
 * Creates a new group object attached to a hub.
 *
 * @param {string} classTsid specific class of the group
 * @param {string} hubId hub to attach the group to
 * @returns {Group} the new group
 */
exports.apiNewGroupForHub = function apiNewGroupForHub(classTsid, hubId) {
	log.debug('global.apiNewGroupForHub(%s, %s)', classTsid, hubId);
	return Group.create(classTsid, hubId);
};


/**
 * Creates a new item (or bag) with the given class.
 *
 * @param {string} classTsid ID of the desired item class
 * @returns {Item|Bag} the new object
 */
exports.apiNewItem = function apiNewItem(classTsid) {
	log.trace('global.apiNewItem(%s)', classTsid);
	return getItemType(classTsid).create(classTsid);
};


exports.apiNewItemFromSource = function apiNewItemFromSource(classTsid, sourceItem) {
	log.trace('global.apiNewItemFromSource(%s, %s)', classTsid, sourceItem);
	//TODO: animation announcements&docs
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


exports.apiNewItemStackFromSource = function apiNewItemStackFromSource(
	classTsid, count, sourceItem) {
	log.debug('global.apiNewItemStackFromSource(%s, %s, %s)', classTsid, count,
		sourceItem);
	//TODO: adjust&document once itemstack animations are available
	return getItemType(classTsid).create(classTsid, count);
};


exports.apiNewItemStackFromFamiliar = function apiNewItemStackFromFamiliar(
	classTsid, count) {
	log.debug('global.apiNewItemStackFromFamiliar(%s, %s)', classTsid, count);
	//TODO: adjust&document once itemstack animations are available
	return getItemType(classTsid).create(classTsid, count);
};


exports.apiNewItemStackFromXY = function apiNewItemStackFromXY(
	classTsid, count, x, y) {
	log.debug('global.apiNewItemStackFromXY(%s, %s, %s, %s)', classTsid, count,
		x, y);
	//TODO: adjust&document once itemstack animations are available
	var ret = getItemType(classTsid).create(classTsid, count);
	ret.setXY(x, y);
	return ret;
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
	return isPlayerOnline(tsid);
};


/**
 * Stores a record with an arbitrary number of fields in a dedicated
 * game activity log.
 *
 * @param {string} type activity/action type to log (arbitrary string)
 * @param {...string} field log record field like `"key=somevalue"`
 */
exports.apiLogAction = function apiLogAction(type) {
	log.trace('global.apiLogAction()');
	logging.logAction(type, Array.prototype.slice.call(arguments, 1));
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


/**
 * Calls a method on each object in a list of game objects.
 *
 * @param {string} fname name of the function to call for each object
 * @param {string[]|object} targets a list of TSIDs or an object with
 *        TSIDs as keys
 * @param {...*} [args] arbitrary arguments for the called function
 * @returns {object} a hash with TSIDs as keys and values representing
 *          the function call results; see {@link
 *          module:model/globalApi~callFor|callFor} for details
 */
exports.apiCallMethod = function apiCallMethod(fname, targets) {
	log.debug('global.apiCallMethod(%s)',
		Array.prototype.slice.call(arguments).join(', '));
	var args = Array.prototype.slice.call(arguments, apiCallMethod.length);
	return callFor(fname, targets, args);
};


/**
 * Calls a method for each player in a given list. Players that are not
 * currently online are skipped.
 *
 * @param {string} fname name of the function to call for each player
 * @param {string[]|object} targets a list of player TSIDs or an object
 *        with player TSIDs as keys
 * @param {...*} [args] arbitrary arguments for the called function
 * @returns {object} a hash with TSIDs as keys and values representing
 *          the function call results; see {@link
 *          module:model/globalApi~callFor|callFor} for details
 */
exports.apiCallMethodForOnlinePlayers =
	function apiCallMethodForOnlinePlayers(fname, targets) {
	log.debug('global.apiCallMethodForOnlinePlayers(%s)',
		Array.prototype.slice.call(arguments).join(', '));
	var args = Array.prototype.slice.call(arguments,
		apiCallMethodForOnlinePlayers.length);
	return callFor(fname, targets, args, true);
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
	return safeClone(obj);
};


/**
 * Returns a copy of the data of a game object, specified by TSID.
 * The returned data may (by nature of being a copy) quickly get out of
 * sync with the original object.
 *
 * @param {string} tsid TSID of the object to retrieve
 * @returns {object} a copy of the desired object's data
 */
exports.apiGetObjectContent = function apiGetObjectContent(tsid) {
	log.debug('global.apiGetObjectContent(%s)', tsid);
	var obj = pers.get(tsid);
	if (utils.isGeo(obj))
		return geoCopy(obj);
	else
		return safeClone(obj);
};


/**
 * Sends a message to **all** connected clients (on all GS instances).
 * Does not provide any feedback about message delivery status/success.
 *
 * @param {object} msg the message to send
 */
exports.apiSendToAll = function apiSendToAll(msg) {
	log.info({msg: msg}, 'global.apiSendToAll');
	config.forEachGS(function sendToGS(gsconf, cb) {
		if (gsconf.gsid === config.getGsid()) {
			sessionMgr.sendToAll(msg);
		}
		else {
			log.debug('forwarding apiSendToAll request to %s', gsconf.gsid);
			rpc.sendRequest(gsconf.gsid, 'gs', ['sendToAll', [msg]]);
		}
	});
};


/**
 * Sends a message to a group of players.
 *
 * @param {object} msg the message to send
 * @param {object|array|string|Player} recipients player list parameter
 *        (see {@link module:utils~playersArgToList|playersArgToList}
 *        for details)
 */
exports.apiSendToGroup = function apiSendToGroup(msg, recipients) {
	log.debug('global.apiSendToGroup(%s, %s)', msg, recipients);
	slackChat.handleGroupMsg(msg);
	var tsids = utils.playersArgToList(recipients);
	tsids.forEach(function iter(tsid) {
		if (isPlayerOnline(tsid)) {
			pers.get(tsid).send(msg);
		}
	});
};

exports.apiSendToHub = function apiSendToHub(msg, hubId) {
	log.debug('global.apiSendToHub(%s)', msg);
	log.warn('TODO global.apiSendToHub not implemented yet');
};


exports.apiMD5 = function apiMD5(string) {
	log.debug('global.apiMD5(%s)', string);
	return crypto.createHash('md5').update(string).digest('hex');
};


exports.apiFindGlobalPathX = function apiFindGlobalPathX(from, to) {
	log.debug('global.apiFindGlobalPathX(%s, %s)', from, to);
	//TODO: implement&document me
	log.warn('TODO globa.apiFindGlobalPathX not implemented yet');
	return [];
};


exports.apiFindShortestGlobalPath = function apiFindShortestGlobalPath(from, tos) {
	log.debug('global.apiFindShortestGlobalPath(%s, %s)', from,
		Array.prototype.slice.call(tos).join());
	//TODO: implement&document me
	log.warn('TODO global.apiFindShortestGlobalPath not implemented yet');
	return [];
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

/**
 * Create a new Group object
 *
 * @param {string} classTsid : class of the group
 */
exports.apiNewGroup = function apiNewGroup(classTsid) {
	log.debug('global.apiNewGroup(%s)', classTsid);
	return Group.create(classTsid);
};

exports.apiAdminCall = function apiAdminCall(methodName, args) {
	log.debug('global.apiAdminCall(%s, %s)', methodName, args);
	//TODO: forward to other game servers
	gsjsBridge.getAdmin()[methodName](args);
};

exports.apiReloadDataForGlobalPathFinding = function apiReloadDataForGlobalPathFinding() {
	log.debug('global.apiReloadDataForGlobalPathFinding()');
	log.warn('TODO global.apiReloadDataForGlobalPathFinding not implemented yet');
} ;