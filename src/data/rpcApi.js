'use strict';

/**
 * Functions for external components (e.g. the webapp or HTTP API),
 * available through {@link module:data/rpc|RPC}.
 *
 * @module
 */

var NEW_PLAYER_LOC = 'LLI32G3NUTD100I';

// public interface
module.exports = {
	toString: toString,
	getConnectData: getConnectData,
	createPlayer: redirWrap(createPlayer, NEW_PLAYER_LOC),
	resetPlayer: redirWrap(resetPlayer),
	getGsjsConfig: getGsjsConfig,
	sendToAll: sendToAll,
	getPlayerInfo: getPlayerInfo,
};


var assert = require('assert');
var auth = require('comm/auth');
var config = require('config');
var pers = require('data/pers');
var rpc = require('data/rpc');
var util = require('util');
var utils = require('utils');
var gsjsBridge = require('model/gsjsBridge');
var Player = require('model/Player');
var sessionMgr = require('comm/sessionMgr');
var lodash = require('lodash');


function toString() {
	return 'rpcApi';
}


/**
 * Wrapper for RPC functions that must be executed on the "right" GS
 * instance for a game object; forwards calls to the appropriate
 * instance when necessary, otherwise just calls the function directly.
 *
 * @param {function} func the RPC call handler to wrap
 * @param {string} [fixedTsid] if provided, requests will *always* be
 *        forwarded to the GS instance responsible for this specific
 *        TSID; otherwise, the **first** argument to the RPC handler
 *        function is assumed to contain the relevant game object or
 *        its TSID
 * @returns {function} the wrapped RPC handler function
 */
// forward calls to appropriate GS instance if necessary
function redirWrap(func, fixedTsid) {
	return function redirWrapper() {
		var objOrTsid = fixedTsid || arguments[0];
		if (rpc.isLocal(objOrTsid)) {
			return func.apply(null, arguments);
		}
		else {
			var gsid = rpc.getGsid(objOrTsid);
			log.debug('forwarding %s request to %s', func.name, gsid);
			return rpc.sendRequest(gsid, 'gs',
				[func.name, Array.prototype.slice.call(arguments)]);
		}
	};
}


/**
 * Retrieves login connection parameters for a given player,
 * corresponding to his/her current or last location.
 *
 * @param {string} playerTsid TSID of the player
 * @returns {object} connection parameters for the client, i.e.
 *          something like:
 * ```
 * {
 *     hostPort: '12.34.56.78:1445',
 *     authToken: 'A-VALID-AUTH-TOKEN'
 * }
 * ```
 */
function getConnectData(playerTsid) {
	log.info('rpcApi.getConnectData(%s)', playerTsid);
	var gsConf = config.getGSConf(rpc.getGsid(playerTsid));
	var token = auth.getToken(pers.get(playerTsid));
	return {
		hostPort: gsConf.hostPort,
		authToken: token,
	};
}


/**
 * Creates and initializes a new, "blank" player.
 *
 * @param {string} userId player's user ID in the webapp
 * @param {string} name desired name of the player
 * @param {string} [tsid] predefined custom TSID
 * @returns {string} the new player's TSID
 */
function createPlayer(userId, name, tsid) {
	log.info('rpcApi.createPlayer(%s, %s)', userId, name);
	assert(typeof userId === 'string' && userId.trim().length > 0,
		util.format('invalid user ID: "%s"', userId));
	assert(typeof name === 'string' && name.trim().length > 2,
		util.format('invalid player name: "%s"', name));
	//TODO: more checks on name (e.g. only "safe" (printable&visible) characters,
	// etc.); generally, a lot more data validation should probably happen here
	var data = {
		userid: userId.trim(),
		label: name.trim(),
		class_tsid: 'human',
		av_meta: {
			pending: false,
			sheets: '/c2.glitch.bz/avatars/2011-03-24/' +
				'2765262852ce6775fa7a497259aecb39_1301011661',
			singles: '/c2.glitch.bz/avatars/2011-06-03/' +
				'2765262852ce6775fa7a497259aecb39_1307145346',
			version: 3,
		},
		//TODO: for now, skip tutorial. Eventually, location should be set the
		// first newxp location, as configured in GSJS config (either initialized
		// here, or in GSJS somewhere)
		skip_newux: true,
		location: pers.get(NEW_PLAYER_LOC),
		x: 2750,
		y: -55,
	};
	if (tsid) data.tsid = tsid;
	var pc = Player.create(data);
	makeAlphaAdjustments(pc);
	pc.unload();
	return pc.tsid;
}


/**
 * Resets an existing blank player (for testing).
 *
 * @param {string} tsid TSID of the player that should be reset
 */
function resetPlayer(tsid) {
	var pc = pers.get(tsid);
	assert(!!pc, 'player not found: ' + tsid);
	// check for invalid item references that would break the reset function
	// (TODO: this is a bug workaround and should eventually go away)
	(function check(items) {
		for (var k in items) {
			var it = pers.get(k);
			if (null === it) {
				log.warn({pc: tsid, item: k}, 'deleting broken item reference');
				delete items[k];
			}
			else if (utils.isBag(it)) {  // recurse
				check(it.items);
			}
		}
	})(pc.items);
	// do the reset
	pc.resetForTesting(true);
	makeAlphaAdjustments(pc);
}


// temporary adjustments for alpha players that should be removed at some point (TODO...)
function makeAlphaAdjustments(pc) {
	pc.teleportToLocation(NEW_PLAYER_LOC, 2750, -55);
	pc.stats.currants.setVal(100000);
}


function getGsjsConfig() {
	return gsjsBridge.getConfig();
}


/**
 * Asynchronously sends a message to all logged in clients connected to
 * this GS instance.
 *
 * @param {object} msg the message to send
 */
function sendToAll(msg) {
	sessionMgr.sendToAll(msg);
}


/**
 * Retrieves runtime information about all currently connected players.
 * Note that the collected data is a momentary snapshot and typically
 * already outdated the moment it is returned.
 *
 * @param {boolean} [locally] only return information about players on
 *        this GS instance if `true` (otherwise, includes data from all
 *        GS workers)
 * @returns {object} a hash with player TSIDs as keys and data records
 *          containing player information as values
 */
function getPlayerInfo(locally) {
	if (locally) {
		return sessionMgr.getPlayerInfo();
	}
	var ret = {};
	config.forEachGS(function collect(gsconf, cb) {
		var gsid = gsconf.gsid;
		var res = {};
		if (gsid === config.getGsid()) {
			res = sessionMgr.getPlayerInfo();
		}
		else {
			res = rpc.sendRequest(gsid, 'gs', ['getPlayerInfo', [true]]);
		}
		// add 'gs' property to each entry:
		lodash.assign(ret, res, function addGS(destVal, srcVal) {
			srcVal.gs = gsid;
			return srcVal;
		});
		cb();
	});
	return ret;
}
