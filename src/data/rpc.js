'use strict';

/**
 * Module for management of the transparent RPC connections between
 * game servers, which enable the GSJS code to call functions on any
 * game object without needing to worry about of the underlying
 * distributed server architecture.
 *
 * Also exposes RPC access to the global API, the GSJS admin singleton
 * object, and the {@link module:data/rpcApi|GS RPC API} (through the
 * RPC functions `api`, `admin` and `gs`, respectively).
 *
 * Contains functions for setting up/shutting down the RPC connections,
 * and sending and handling RPC requests (which are used by the {@link
 * module:data/rpcProxy|transparent RPC proxy}).
 *
 * @see {@link module:config|config}
 *
 * @module
 */

// public interface
module.exports = {
	RpcError: RpcError,
	init: init,
	shutdown: shutdown,
	makeProxy: makeProxy,
	sendRequest: sendRequest,
	isLocal: isLocal,
	getGsid: getGsid,
};


var assert = require('assert');
var async = require('async');
var config = require('config');
var jrpc = require('multitransport-jsonrpc');
var orProxy = require('data/objrefProxy');
var pers = require('data/pers');
var RC = require('data/RequestContext');
var rpcApi = require('data/rpcApi');
var rpcProxy = require('data/rpcProxy');
var utils = require('utils');
var util = require('util');
var wait = require('wait.for');
var gsjsBridge = require('model/gsjsBridge');


/**
 * Custom error type for errors during RPC requests.
 * 
 * @param {string} [msg] error message
 * @constructor
 */
// see <https://stackoverflow.com/a/5251506>, <https://stackoverflow.com/a/8804539>,
// <https://code.google.com/p/v8/wiki/JavaScriptStackTraceApi>
function RpcError(msg, cause) {
	this.message = msg;
	if (cause) {
		this.message = util.format('%s (caused by: %s)', this.message, cause);
	}
	Error.captureStackTrace(this, RpcError);
	// log something here just in case, because who knows what the GSJS ends up
	// doing with the error
	log.error(cause, msg);
}
RpcError.prototype = Object.create(Error.prototype);
RpcError.prototype.constructor = RpcError;
RpcError.prototype.name = 'RpcError';


// RPC clients for connection to other GSs stored here (by gsid):
var clients = {};
// RPC server (for other GSs to connect to):
var server;


/**
 * Initializes the RPC subsystem (server for this GS instance, and
 * client connections to all other GS instances).
 *
 * @param {function} [callback]
 * ```
 * callback(err)
 * ```
 * called when all RPC connections have been established successfully
 * (`err` argument is `null`), or when an error occurred (`err`
 * contains the error object or message)
 */
function init(callback) {
	clients = {};
	initServer(function cb() {
		config.forEachGS(initClient, callback);
	});
}


/**
 * Initializes the RPC server for this GS instance.
 *
 * @param {function} [callback] called when the server socket is ready
 * @private
 */
function initServer(callback) {
	var port = config.getRpcPort();
	log.info('starting RPC server on port %s', port);
	server = new jrpc.server(
		new jrpc.transports.server.tcp(port, {
			logger: getJrpcLogger('server'),
		})
	);
	if (callback) server.transport.on('listening', callback);
	server.transport.on('connection', onServerConnection);
	server.transport.on('closedConnection', onServerClosedConnection);
	server.transport.on('listening', onServerListening);
	server.transport.on('retry', onServerRetry);
	server.transport.on('error', onServerError);
	server.transport.on('shutdown', onServerShutdown);
	server.register('obj', objectRequest);
	server.register('admin', adminRequest);
	server.register('api', globalApiRequest);
	server.register('gs', gsApiRequest);
}


/**
 * Initializes the RPC connection to another GS instance. The resulting
 * client endpoint is stored in the `clients` hash.
 *
 * @param {object} gsconf a game server network configuration record
 *        (see {@link module:config~mapToGS|config.mapToGS})
 * @param {function} [callback] called when the client endpoint is
 *        connected to its server
 * @private
 */
function initClient(gsconf, callback) {
	if (gsconf.gsid === config.getGsid()) return callback();  // skip self
	var gsid = gsconf.gsid;
	var port = config.getRpcPort(gsid);
	log.info('starting RPC client for %s (%s:%s)', gsid, gsconf.host, port);
	var client = new jrpc.client(
		new jrpc.transports.client.tcp(gsconf.host, port, {
			logger: getJrpcLogger('client-' + gsid),
		}), {},
		function(connectedClient) {
			log.info('RPC client for %s connected', gsid);
			clients[gsid] = connectedClient;
			callback();
		}
	);
	client.transport.on('retry', getOnClientRetryHandler(gsid));
	client.transport.on('end', getOnClientEndHandler(gsid));
	client.transport.on('sweep', getOnClientSweepHandler(gsid));
	client.transport.on('shutdown', getOnClientShutdownHandler(gsid));
}


/**
 * Shuts down all RPC client connections and the RPC server for this
 * GS.
 *
 * @param {function} [callback] called when all RPC connections have
 *        been terminated
 */
function shutdown(callback) {
	// first shut down the clients...
	async.each(Object.keys(clients), function iterator(gsid, cb) {
		if (clients[gsid]) clients[gsid].shutdown(cb);
	},
	function clientsDone(err) {
		if (err) log.error(err, 'error shutting down RPC clients');
		// ...then the server (regardless of client shutdown errors)
		server.shutdown(function cleanup() {
			server = undefined;
			clients = {};
			if (callback) callback();
		});
	});
}


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


/**
 * Client-side RPC handler; used by the {@link module:data/rpcProxy|
 * rpcProxy} to forward a function call to the authoritative game
 * server for the respective game object.
 * Returns the result either via callback or synchronously using
 * {@link https://github.com/luciotato/waitfor|wait.for/fibers}.
 * 
 * @param {GameObject|string} objOrTsid game object on which the
 *        function is being called (or more precisely, its local {@link
 *        module:data/rpcProxy|rpcProxy}-wrapped copy), or its TSID
 * @param {string} fname name of the function to call
 * @param {array} args function arguments supplied by the original
 *        caller
 * @param {function} [callback]
 * ```
 * callback(err, res)
 * ```
 * called with the function result (`res`) or an error (`err`) when the
 * RPC returns; if not supplied, the function behaves synchronously and
 * returns the result (or throws an exception)
 * @returns {*} result of the remote function call if no callback was
 *          supplied (`undefined` otherwise)
 * @throws {RpcError} in case something bad happens during the RPC and
 *         no callback was supplied
 */
function sendRequest(objOrTsid, fname, args, callback) {
	var gsid;
	var client;
	try {
		gsid = getGsid(objOrTsid);
		client = clients[gsid];
	}
	catch (e) {
		// caller has to handle this, like any other "regular" error the
		// called function might have thrown locally
		throw new RpcError(util.format('could not get RPC client to %s for %s', gsid, objOrTsid), e);
	}
	if (!client) {
		throw new RpcError(util.format('no RPC client to %s found for %s', gsid, objOrTsid));
	}
	// argument marshalling (replace objref proxies with actual objrefs)
	args = orProxy.refify(args);
	var logmsg = util.format('%s.%s(%s) via RPC on %s', objOrTsid, fname,
		args.join(', '), gsid);
	log.debug('calling %s', logmsg);
	var tsid = typeof objOrTsid === 'string' ? objOrTsid : objOrTsid.tsid;
	var rpcArgs = [config.getGsid(), tsid, fname, args];
	if (callback) {
		client.request('obj', rpcArgs, function cb(err, res) {
			if (!err) orProxy.proxify(res);
			callback(err, res);
		});
	}
	else {
		try {
			var ret = wait.forMethod(client, 'request', 'obj', rpcArgs);
			orProxy.proxify(ret);
			return ret;
		}
		catch (e) {
			throw new RpcError('error calling ' + logmsg, e);
		}
	}
}


/**
 * Server-side RPC request handler. Executes a function on an object
 * specified by TSID (within a separate request context) and returns
 * the result to the remote caller.
 * 
 * @param {string} callerId ID of the component requesting the function
 *        call (for logging)
 * @param {object|string} objOrTsid either an object whose function
 *        with the given name should be called, or the TSID of a game
 *        object
 * @param {string} fname name of the function to call on the object
 * @param {array} args function call arguments
 * @param {function} callback
 * ```
 * callback(error, result)
 * ```
 * callback for the RPC library, returning the result (or errors) to
 * the remote caller
 */
function handleRequest(callerId, objOrTsid, fname, args, callback) {
	orProxy.proxify(args);  // unmarshal arguments
	var logmsg = util.format('RPC from %s: %s.%s', callerId, objOrTsid, fname);
	log.debug('%s(%s)', logmsg, args instanceof Array ? args.join(', ') : args);
	// process RPC in its own request context
	var rc = new RC(objOrTsid + '.' + fname, 'rpc.' + callerId);
	rc.run(
		function rpcReq() {
			var obj = objOrTsid;
			if (typeof obj === 'string') {
				obj = pers.get(obj);
			}
			if (!obj || typeof obj[fname] !== 'function') {
				throw new RpcError(util.format('no such function: %s.%s',
					objOrTsid, fname));
			}
			var ret = obj[fname].apply(obj, args);
			// convert <undefined> result to <null> so RPC lib produces a valid
			// response (it just omits the <result> property otherwise)
			if (ret === undefined) ret = null;
			return ret;
		},
		function rpcReqCallback(err, res) {
			if (err) {
				log.error(err, 'exception in %s', logmsg);
			}
			if (typeof callback !== 'function') {
				log.error('%s called without a valid callback', logmsg);
			}
			else {
				res = orProxy.refify(res);  // marshal return value
				callback(err, res);
			}
		},
		true  // make sure changes are persisted before returning RPC
	);
}


/**
 * Wrapper around {@link module:data/rpc~handleRequest|handleRequest}
 * for game object function calls.
 *
 * @param {string} callerId ID of the calling component (for logging)
 * @param {string} tsid TSID of the game object to call the function on
 * @param {string} fname name of the function to call on the object
 * @param {array} args function call arguments
 * @param {function} callback callback for the RPC library, returning
 *        the result (or errors) to the remote caller
 */
function objectRequest(callerId, tsid, fname, args, callback) {
	handleRequest(callerId, tsid, fname, args, callback);
}


/**
 * Wrapper around {@link module:data/rpc~handleRequest|handleRequest}
 * for global API function calls.
 *
 * @param {string} callerId ID of the calling component (for logging)
 * @param {string} fname name of the global API function to call
 * @param {array} args function call arguments
 * @param {function} callback callback for the RPC library, returning
 *        the result (or errors) to the remote caller
 */
function globalApiRequest(callerId, fname, args, callback) {
	//TODO dummy, replace with actual global API once there is one:
	var dummyApi = {
		valueOf: function valueOf() { return 'TODO-DUMMY-API'; }
	};
	handleRequest(callerId, dummyApi, fname, args, callback);
}


/**
 * Wrapper around {@link module:data/rpc~handleRequest|handleRequest}
 * for GSJS admin object calls.
 *
 * @param {string} callerId ID of the calling component (for logging)
 * @param {string} fname name of the GSJS admin function to call
 * @param {array} argsObject object containing options/parameters
 * @param {function} callback callback for the RPC library, returning
 *        the result (or errors) to the remote caller
 */
function adminRequest(callerId, fname, argsObject, callback) {
	handleRequest(callerId, gsjsBridge.getAdmin(), fname, [argsObject], callback);
}


/**
 * Wrapper around {@link module:data/rpc~handleRequest|handleRequest}
 * for {@link module:data/rpcApi|game server RPC API} calls.
 *
 * @param {string} callerId ID of the calling component (for logging)
 * @param {string} fname name of the API function to call
 * @param {array} args function call arguments
 * @param {function} callback callback for the RPC library, returning
 *        the result (or errors) to the remote caller
 */
function gsApiRequest(callerId, fname, args, callback) {
	handleRequest(callerId, rpcApi, fname, args, callback);
}


/**
 * Tests if this game server instance is responsible for a given
 * game object.
 *
 * @param {GameObject|string} objOrTsid the game object to check
 * @returns {boolean} `true` if this is the authoritative server
 *          instance for the given object, `false` otherwise
 */
function isLocal(objOrTsid) {
	return getGsid(objOrTsid) === config.getGsid();
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


// ***
// helper functions and event handlers for multitransport-jsonrpc
// ***

function getJrpcLogger(tag) {
	return function jrpcLog(msg) {
		log.trace('[jrpc log %s] %s', tag, msg);
	};
}


function onServerConnection(conn) {
	log.debug('[jrpc server] new connection from %s:%s',
		conn.remoteAddress, conn.remotePort);
}


function onServerClosedConnection(conn) {
	log.debug('[jrpc server] connection from %s:%s closed',
		conn.remoteAddress, conn.remotePort);
}


function onServerListening() {
	log.info('[jrpc server] listening for connections');
}


function onServerRetry() {
	log.warn('[jrpc server] retrying');
}


function onServerError(err) {
	log.error('[jrpc server] %s', err);
}


function onServerShutdown() {
	log.info('[jrpc server] shutdown');
}


function getOnClientRetryHandler(gsid) {
	return function onClientRetry() {
		log.info('[jrpc client for %s] reconnecting', gsid);
	};
}


function getOnClientEndHandler(gsid) {
	return function onClientEnd() {
		log.warn('[jrpc client for %s] connection ended (failed to reconnect)', gsid);
	};
}


function getOnClientSweepHandler(gsid) {
	return function onClientSweep(requests) {
		if (requests) {
			for (var key in requests) {
				log.warn('[jrpc client for %s] clearing stale request: %s', gsid, key);
			}
		}
	};
}


function getOnClientShutdownHandler(gsid) {
	return function onClientShutdown() {
		log.info('[jrpc client for %s] shutdown', gsid);
	};
}
