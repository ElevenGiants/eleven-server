'use strict';

/**
 * A thin common interface layer for pluggable authentication back-end
 * modules. These modules must implement the following API:
 * ```
 *     init(config, callback)
 *     authenticate(token) -> playerTsid
 *     getToken(player) -> token
 *     getTokenLifespan() -> number
 * ```
 *
 * @module
 */

// public interface
module.exports = {
	AuthError: AuthError,
	init: init,
	authenticate: authenticate,
	getToken: getToken,
	getTokenLifespan: getTokenLifespan,
};


var _ = require('lodash');
var assert = require('assert');


/**
 * Custom authentication error type.
 *
 * @param {string} [msg] error message
 * @constructor
 */
// see <https://stackoverflow.com/a/5251506>, <https://stackoverflow.com/a/8804539>,
// <https://code.google.com/p/v8/wiki/JavaScriptStackTraceApi>
function AuthError(msg, cause) {
	this.message = msg;
	Error.captureStackTrace(this, AuthError);
	// log cause (for possible auth debugging)
	log.info(cause, msg);
}
AuthError.prototype = Object.create(Error.prototype);
AuthError.prototype.constructor = AuthError;
AuthError.prototype.name = 'AuthError';


// auth back-end
var abe = null;


/**
 * (Re-)initializes the authentication layer.
 *
 * @param {object} backEnd auth back-end module; must implement the API
 *        shown in the above module docs.
 * @param {object} [config] configuration options for back-end module
 * @param {function} [callback] called when auth layer is ready, or an
 *        error occurred during initialization
 */
function init(backEnd, config, callback) {
	abe = backEnd;
	if (abe && _.isFunction(abe.init)) {
		abe.init(config);
	}
	if (callback) return callback();
}


/**
 * Authenticates a client/player.
 *
 * @param {string} token authentication token supplied by the client
 * @returns {string} player TSID (if successfully authenticated)
 * @throws {AuthError} if authentication failed
 */
function authenticate(token) {
	assert(abe !== undefined && abe !== null, 'no auth back-end configured');
	var ret = abe.authenticate(token);
	log.info({token: token}, '%s successfully authenticated', ret);
	return ret;
}


/**
 * Retrieves an authentication token for the given player, or generates
 * a new one if necessary.
 *
 * @param {Player} player the player to generate a token for
 * @returns {string} a valid authentication token
 */
function getToken(player) {
	assert(abe !== undefined && abe !== null, 'no auth back-end configured');
	var ret = abe.getToken(player);
	log.debug({token: ret}, 'auth token generated for %s', player);
	return ret;
}


/**
 * Returns the minimal guaranteed lifespan of an authentication token.
 *
 * @returns {number} guaranteed minimal token lifespan **in seconds**,
 *          or `0` if the generated tokens are valid infinitely
 */
function getTokenLifespan() {
	assert(abe !== undefined && abe !== null, 'no auth back-end configured');
	return abe.getTokenLifespan();
}
