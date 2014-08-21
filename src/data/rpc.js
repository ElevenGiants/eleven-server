/**
 * @module
 */

// public interface
module.exports = {
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
var rpcProxy = require('data/rpcProxy');
var pers = require('data/pers');
var utils = require('utils');
var util = require('util');


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
	server.register('gsrpc', handleRequest);
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
			callback();
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


function sendRequest(obj, fname, args) {
	//TODO
}


function handleRequest() {
	//TODO
}


/**
 * Tests if this game server instance is responsible for a given
 * game object.
 *
 * @param {GameObject} obj the game object to check
 * @returns {boolean} `true` if this is the authoritative server
 *          instance for the given object, `false` otherwise
 */
function isLocal(obj) {
	return getGsid(obj) === config.getGsid();
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
