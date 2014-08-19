/**
 * @module
 */

// public interface
module.exports = {
	makeProxy: makeProxy,
	sendRequest: sendRequest,
	isLocal: isLocal,
};


var rpcProxy = require('data/rpcProxy');


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


function isLocal(obj) {
	//TODO
}
