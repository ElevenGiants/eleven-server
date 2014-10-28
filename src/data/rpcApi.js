'use strict';

/**
 * Functions for external components (e.g. the webapp or HTTP API),
 * available through {@link module:data/rpc|RPC}.
 *
 * @module
 */

// public interface
module.exports = {
	toString: toString,
	getConnectData: getConnectData,
	createPlayer: createPlayer,
};


var assert = require('assert');
var auth = require('comm/auth');
var config = require('config');
var pers = require('data/pers');
var rpc = require('data/rpc');
var util = require('util');
var Player = require('model/Player');


function toString() {
	return 'rpcApi';
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
 * @returns {string} the new player's TSID
 */
function createPlayer(userId, name) {
	log.info('rpcApi.createPlayer(%s, %s)', userId, name);
	assert(typeof userId === 'string' && userId.trim().length > 0,
		util.format('invalid user ID: "%s"', userId));
	assert(typeof name === 'string' && name.trim().length > 2,
		util.format('invalid player name: "%s"', name));
	//TODO: more checks on name (e.g. only "safe" (printable&visible) characters,
	// etc.); generally, a lot more data validation should probably happen here
	var pc = Player.create({
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
		location: pers.get('LLI32G3NUTD100I'),
		x: 2750,
		y: -55,
	});
	pc.unload();
	return pc.tsid;
}
