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
	ping: ping,
	getConnectData: getConnectData,
	createPlayer: redirWrap(createPlayer, NEW_PLAYER_LOC),
	getGsjsConfig: getGsjsConfig,
	sendToAll: sendToAll,
	getPlayerInfo: getPlayerInfo,
	getSessionInfo: getSessionInfo,
	getGSStatus: getGSStatus,
};


var _ = require('lodash');
var assert = require('assert');
var auth = require('comm/auth');
var config = require('config');
var pers = require('data/pers');
var rpc = require('data/rpc');
var utils = require('utils');
var gsjsBridge = require('model/gsjsBridge');
var api = require('model/globalApi');
var Player = require('model/Player');
var sessionMgr = require('comm/sessionMgr');
var wait = require('wait.for');


function toString() {
	return 'rpcApi';
}


/**
 * Wrapper for RPC functions that must be executed on the "right" GS
 * instance for a game object; forwards calls to the appropriate
 * instance when necessary, otherwise just calls the function directly.
 * NB: only works for functions with a fixed number of parameters.
 *
 * @param {function} func the RPC call handler to wrap
 * @param {string} [fixedTsid] if provided, requests will *always* be
 *        forwarded to the GS instance responsible for this specific
 *        TSID; otherwise, the **first** argument to the RPC handler
 *        function is assumed to contain the relevant game object or
 *        its TSID
 * @returns {function} the wrapped RPC handler function
 */
function redirWrap(func, fixedTsid) {
	return function redirWrapper() {
		var args = Array.prototype.slice.call(arguments);
		var objOrTsid = fixedTsid || args[0];
		if (rpc.isLocal(objOrTsid)) {
			return func.apply(null, args.slice(0, func.length));
		}
		// slightly hacky trick to prevent redirect loops without extending
		// the RPC mechanism: append an indicator flag to the function args
		if (arguments[func.length]) {
			throw new rpc.RpcError('redirect loop detected');
		}
		args[func.length] = true;  // set forwarded flag
		var gsid = rpc.getGsid(objOrTsid);
		log.debug('forwarding %s request to %s', func.name, gsid);
		return rpc.sendRequest(gsid, 'gs', [func.name, args]);
	};
}


/**
 * Trivial ping function for monitoring (e.g. cluster heartbeat).
 */
function ping() {
	return 'pong';
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
	assert(_.isString(userId) && userId.trim().length,
		`invalid user ID: "${userId}"`);
	assert(_.isString(name) && name.trim().length > 2,
		`invalid player name: "${name}"`);
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
	// generate a random newxp location
	var locs = gsjsBridge.getConfig().newxp_exits;
	var loc = locs[Math.floor(Math.random() * locs.length)];
	// check if location exists and use NEW_PLAYER_LOC if it does not
	var loadedLocation = pers.get(loc.tsid);
	if (loadedLocation) {
		data.location = loadedLocation;
		data.x = loc.x;
		data.y = loc.y;
	}
	// create player object
	var pc = Player.create(data);
	// make adjustments
	pc.stats.has_subscription = true;
	pc.stats.subscription_end = 9999999999;
	pc.createItem('tester_widget', 1);
	var s = api.apiNewItemStack('note', 1);
	if (s) {
		s.label = 'README FIRST!';
		s.setInstanceProp('initial_title', "README FIRST!");
		s.setInstanceProp('initial_text', "Welcome to the Eleven Alpha! Here are 5 " +
			"tips to get you started:\n\n1) Open Global Chat to find other alphas and " +
			"ask questions! Type /who to see who's around. (Didn't work? Type in Local " +
			"Chat first.)\n\n2) The Tester Tool in your inventory is there for you! " +
			"Don't be shy about using to Max energy, Teleport to Gregarious Grange " +
			"(Eleven's town square) or escape the Ersatz Chamber, get useful Items, " +
			"and more!\n\n3) Type /home or /house in Local Chat to quickly get to your " +
			"Home Street or into your House.\n\n4) The IMG bubble in the upper left can " +
			"also take you Home. You can choose from many preset Looks there after you " +
			"hit Level 3.\n\n5) The Alpha subforum is the #1 place for info and support, " +
			"especially dev help. You'll need to log out and back in at " +
			"https://forum.elevengiants.com/ to see it. Check out the pinned posts for " +
			"dev announcements and snarkle's Beginner Tips and Helpful Gameplay Links." +
			"\n\nThanks for reading, now go have some preposterous fun!");
		pc.addItemStack(s);
	}
	delete pc.use_img;
	pc.adminBackfillNewxpPhysics();
	// save the new player
	pc.unload();
	return pc.tsid;
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
		_.assignWith(ret, res, function addGS(destVal, srcVal) {
			srcVal.gs = gsid;
			return srcVal;
		});
		cb();
	});
	return ret;
}


function getSessionInfo(locally) {
	if (locally) {
		return sessionMgr.getSessionInfo();
	}
	var ret = {};
	config.forEachGS(function collect(gsconf, cb) {
		var gsid = gsconf.gsid;
		var res = {};
		if (gsid === config.getGsid()) {
			res = sessionMgr.getSessionInfo();
		}
		else {
			res = rpc.sendRequest(gsid, 'gs', ['getSessionInfo', [true]]);
		}
		// add 'gs' property to each entry:
		_.assignWith(ret, res, function addGS(destVal, srcVal) {
			srcVal.gs = gsid;
			return srcVal;
		});
		cb();
	});
	return ret;
}


/**
 * Checks the current status/reachability of all configured GS workers.
 *
 * @param {boolean} [locally] internal (for RPC dispatching)
 * @returns {object} status of the GS cluster, something like this:
 * ```
 * { 'gs01-01': { ok: true },
 *   'gs01-02': { ok: false, error: 'RPC timeout' },
 *   'gs01-03': { ok: false, error: 'PANIQUE' },
 *   ok: false, error: 'RPC timeout' }
 * ```
 * For a simple binary "server available?" decision, it is sufficient
 * to just examine the root `ok` property.
 */
function getGSStatus(locally) {
	var local = {ok: true};
	var maxSessions = config.get('limits:maxSessions', Number.MAX_SAFE_INTEGER);
	if (sessionMgr.getSessionCount() >= maxSessions) {
		local = {ok: false, error: 'connection limit reached'};
	}
	if (locally) {
		return local;
	}
	// somewhat complicated setup to be able to put a timeout around the RPC
	// calls in this special case (we want to return quickly even in case
	// remote GS instances are not reachable)
	var ret = wait.for(config.forEachGS, function getStatus(gsconf, statusCB) {
		var gsid = gsconf.gsid;
		// this GS instance - since we're running this, we're probably ok
		if (gsid === config.getGsid()) {
			return statusCB(null, local);
		}
		// foward call to other workers; set up a timer that will invoke the
		// callback if the RPC does not return within a certain period
		var timedOut = false;
		var timeout = setTimeout(function rpcTimeout() {
			timedOut = true;
			return statusCB(null, {ok: false, error: 'RPC timeout'});
		}, 2000);
		rpc.sendRequest(gsid, 'gs', ['getGSStatus', [true]], function cb(err, res) {
			// abort if it's too late (timeout already hit, so don't invoke
			// callback again)
			if (timedOut) return;
			// otherwise, cancel the timeout mechanism and proceed as planned
			clearTimeout(timeout);
			if (!err) {
				return statusCB(null, res);
			}
			return statusCB(null, {
				ok: false,
				error: _.isError(err) ? err.message : '' + err,
			});
		});
	});
	// add aggregate 'ok' property
	ret.ok = true;
	for (var k in ret) {
		if (_.isObject(ret[k]) && !ret[k].ok) {
			ret.ok = false;
			ret.error = ret[k].error;
			break;
		}
	}
	return ret;
}
