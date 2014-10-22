'use strict';

/**
 * SHA512 HMAC based player authentication back-end. Generates tokens
 * according to the following scheme:
 * ```
 * <PLAYER-TSID>|<HMAC>
 * ```
 * The HMAC consists of the player TSID and a timestamp, hashed with a
 * secret key.
 *
 * Tokens are considered valid if the plain-text TSID matches the one
 * in the hash code, and the timestamp is within the accepted range
 * (see the {@link https://github.com/mixu/token|token} package
 * documentation for details regarding token expiry).
 *
 * Since the generated tokens contain the player TSID, there is no need
 * to store them in persistent storage.
 *
 * @module
 */

// public interface
module.exports = {
	init: init,
	authenticate: authenticate,
	getToken: getToken,
};


var assert = require('assert');
var auth = require('comm/auth');
var token = require('token');
var utils = require('utils');


/**
 * Initializes the {@link https://github.com/mixu/token|token} library
 * with parameters from the global server configuration.
 *
 * @param {object} config configuration settings
 */
function init(config) {
	assert(typeof config === 'object' && config !== null &&
		config.secret !== undefined && utils.isInt(config.timeStep),
		'invalid or missing HMAC auth config');
	token.defaults.secret = config.secret;
	token.defaults.timeStep = config.timeStep;
}


/**
 * Authenticates a client/player.
 *
 * @param {string} t authentication token supplied by the client
 * @returns {string} player TSID (if successfully authenticated)
 * @throws {AuthError} if the given token could not be parsed or is
 *         invalid/expired
 */
function authenticate(t) {
	var tsid, tdata;
	try {
		tsid = t.split('|')[0];
		tdata = t.split('|')[1];
	}
	catch (e) {
		throw new auth.AuthError('invalid token data: ' + t, e);
	}
	var res = token.verify(tsid, tdata);
	if (!res) {
		throw new auth.AuthError('invalid or expired token: ' + t);
	}
	return tsid;
}


/**
 * Generates an authentication token for the given player.
 *
 * @param {Player} player the player to generate a token for
 * @param {object} [options] custom options, overriding those set via
 *        {@link module:comm/abe/hmac~init|init} (for testing)
 * @returns {string} a valid authentication token
 */
function getToken(player, options) {
	var tdata = token.generate(player.tsid, options);
	var ret = player.tsid + '|' + tdata;
	log.debug('generated token for %s: %s', player, ret);
	return ret;
}
