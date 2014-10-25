'use strict';

/**
 * ECMAScript 6 direct proxy helper for transparent RPC wrapping of
 * function calls on game objects. On each game server instance,
 * copies of objects that another server is responsible for are wrapped
 * in RPC proxies, so the GSJS code does not have to take care of the
 * distributed server environment when working with game objects.
 *
 * @see {@link http://wiki.ecmascript.org/doku.php?id=harmony:direct_proxies}
 * @module
 */

// public interface
module.exports = {
	makeProxy: makeProxy,
};


require('harmony-reflect');
var assert = require('assert');
var rpc = require('data/rpc');


/**
 * Wraps a game object (or rather, a copy of a game object that another
 * server instance is responsible for) in a transparent RPC handling
 * proxy.
 *
 * @param {GameObject} obj the game object to wrap
 * @returns {Proxy} wrapped game object
 */
function makeProxy(obj) {
	assert(!obj.__isRP, 'object is already RPC-proxied: ' + obj);
	return new Proxy(obj, {
		get: proxyGet,
	});
}


/**
 * Traps property read access on RPC-proxy-wrapped game objects.
 * Function calls are transparently forwarded to the game server
 * responsible for the object (see {@link module:data/rpc~sendRequest|
 * rpc.sendRequest}); access to properties of any other type is passed
 * through to the local copy of the object. Since this local copy of a
 * remote game object is read from persistence and only cached for the
 * current request, its data is expected to be up to date.
 *
 * @private
 */
function proxyGet(target, name, receiver) {
	if (name === '__isRP') return true;
	// only functions are called remotely
	if (typeof target[name] !== 'function') {
		return target[name];
	}
	if (name === 'valueOf' || name === 'toString') {
		return function() {
			return '^R' + target.toString();
		};
	}
	// call functions inherited from Object locally (e.g. hasOwnProperty(), etc)
	if (Object.prototype.hasOwnProperty(name)) {
		return target[name];
	}
	// anything else: call on remote host
	return function rpcWrapper() {
		// convert function arguments to a proper array
		var args = Array.prototype.slice.call(arguments);
		return rpc.sendRequest(target, name, args);
	};
}
