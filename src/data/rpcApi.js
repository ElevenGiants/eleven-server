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
};


var auth = require('comm/auth');
var config = require('config');
var pers = require('data/pers');
var rpc = require('data/rpc');


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
