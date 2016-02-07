'use strict';
/*jshint -W072 */  // function parameters prescribed by RPC API

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
	preShutdown: preShutdown,
	makeProxy: makeProxy,
	sendRequest: sendRequest,
	sendObjRequest: sendObjRequest,
	isLocal: isLocal,
	getGsid: getGsid,
	makeLocalTsid: makeLocalTsid,
};


var assert = require('assert');
var async = require('async');
var config = require('config');
var jrpc = require('multitransport-jsonrpc');
var metrics = require('metrics');
var orProxy = require('data/objrefProxy');
var pers = require('data/pers');
var RC = require('data/RequestContext');
var RQ = require('data/RequestQueue');
var rpcProxy = require('data/rpcProxy');
var utils = require('utils');
var util = require('util');
var wait = require('wait.for');


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
// flag to activate special shutdown behavior:
var shuttingDown = false;


/**
 * Initializes the RPC subsystem (server for this GS instance, and
 * client connections to all other GS instances).
 *
 * @param {boolean} [startServer] start an RPC server on this GS
 *        instance (`true` by default)
 * @param {function} [callback]
 * ```
 * callback(err)
 * ```
 * called when all RPC connections have been established successfully
 * (`err` argument is `null`), or when an error occurred (`err`
 * contains the error object or message)
 */
function init(startServer, callback) {
	shuttingDown = false;
	clients = {};
	if (arguments.length < 2) {
		if (typeof startServer === 'function') {
			callback = startServer;
		}
		if (typeof startServer !== 'boolean') {
			startServer = true;
		}
	}
	if (startServer) {
		initServer(function cb() {
			config.forEachGS(initClient, callback);
		});
	}
	else {
		config.forEachGS(initClient, callback);
	}
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
			timeout: config.get('net:rpc:timeout'),
		}), {},
		function onConnected(connectedClient) {
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
 * Prepares RPC layer for graceful shutdown.
 */
function preShutdown() {
	// TODO: This is a hack that currently just drops all RPC requests during
	// the shutdown, so players are at least cleanly removed from locations.
	// Eventually, we probably want a two-phase shutdown that disconnects all
	// clients first, and *then* starts taking apart the RPC connections.
	shuttingDown = true;
	for (var k in clients) {
		clients[k].transport.retries = 0;
		clients[k].transport.reconnects = 0;
	}
}


/**
 * Shuts down all RPC client connections and the RPC server for this
 * GS.
 *
 * @param {function} [callback] called when all RPC connections have
 *        been terminated
 */
function shutdown(callback) {
	log.info('RPC subsystem shutdown');
	// first shut down the clients...
	async.each(Object.keys(clients), function iterator(gsid, cb) {
		log.debug('shutting down RPC client for %s', gsid);
		clients[gsid].shutdown(function () {
			log.debug('RPC client for %s shut down', gsid);
			cb();
		});
	},
	function clientsDone(err) {
		// ...then the server (regardless of client shutdown errors)
		if (err) log.error(err, 'error shutting down RPC clients');
		clients = {};
		log.debug('shutting down RPC server');
		server.shutdown(function () {
			log.debug('RPC server shut down');
			server = undefined;
		});
		// TODO: this should really be in the server.shutdown callback above,
		// but for unknown reasons that one is not called reliably, so we'll
		// just return right away here:
		if (callback) return callback();
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
 * Forwards a function call on a game oject to the authoritative game
 * server for the respective object. Returns the result either via
 * callback or synchronously (see {@link module:data/rpc~sendRequest|
 * sendRequest}).
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
function sendObjRequest(objOrTsid, fname, args, callback) {
	var gsid;
	try {
		gsid = getGsid(objOrTsid);
	}
	catch (e) {
		// caller has to handle this, like any other "regular" error the
		// called function might have thrown locally
		throw new RpcError(util.format('could not get RPC client to %s for %s',
			gsid, objOrTsid), e);
	}
	var tsid = typeof objOrTsid === 'string' ? objOrTsid : objOrTsid.tsid;
	var tag = RC.getContext(true) ? RC.getContext().tag + '.' + fname : null;
	return sendRequest(gsid, 'obj', [tsid, tag, fname, args], callback);
}


/**
 * Sends an RPC request to another game server instance, taking care of
 * proper argument and return value (de)serialization.
 * Returns the result either via callback or synchronously using
 * {@link https://github.com/luciotato/waitfor|wait.for/fibers}.
 *
 * @param {string} gsid ID of the game server to forward the call to
 * @param {string} rpcFunc RPC function to call (must be `obj`, `api`,
 *        `admin` or `gs`)
 * @param {array} args function arguments; the obligatory source GS ID
 *        parameter (required for any RPC function) is prepended here
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
function sendRequest(gsid, rpcFunc, args, callback) {
	assert(gsid !== config.getGsid(), 'RPC to self');
	if (shuttingDown) {
		// hack - see above (preShutdown)
		log.info('shutdown in progress, dropping %s RPC request', rpcFunc);
		return;
	}
	var client = clients[gsid];
	if (!client) {
		var err = new RpcError(util.format('no RPC client found for "%s"', gsid));
		if (callback) return callback(err);
		else throw err;
	}
	// argument marshalling (replace objref proxies with actual objrefs)
	args = orProxy.refify(args);
	var logmsg = util.format('%s(%s) @%s', rpcFunc, args.join(', '), gsid);
	log.debug('calling %s', logmsg);
	metrics.increment('net.rpc.tx', 0.01);
	var rpcArgs = [config.getGsid()].concat(args);
	if (callback) {
		client.request(rpcFunc, rpcArgs, function cb(err, res) {
			log.trace('%s returned', logmsg);
			// wrapping to handle the special case where res is an objref itself
			var wrap = {res: res};
			orProxy.proxify(wrap);
			callback(err, res);
		});
	}
	else {
		try {
			var res = wait.forMethod(client, 'request', rpcFunc, rpcArgs);
			// wrapping to handle the special case where res is an objref itself
			var wrap = {res: res};
			orProxy.proxify(wrap);
			return wrap.res;
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
 * @param {object} obj the object on which a function should be called
 * @param {string|null} tag ID tag of ongoing request process this RPC belongs
 *        to (if any)
 * @param {string} fname name of the function to call on the object
 * @param {array} args function call arguments
 * @param {function} callback
 * ```
 * callback(error, result)
 * ```
 * callback for the RPC library, returning the result (or errors) to
 * the remote caller
 */
function handleRequest(callerId, obj, tag, fname, args, callback) {
	metrics.increment('net.rpc.rx', 0.01);
	if (!obj || typeof obj[fname] !== 'function') {
		var msg = util.format('no such function: %s.%s', obj, fname);
		return callback(new RpcError(msg));
	}
	orProxy.proxify(args);  // unmarshal arguments
	var logtag = util.format('%s.%s.%s', callerId, obj.tsid ? obj.tsid : obj, fname);
	log.debug('%s(%s)', logtag, args instanceof Array ? args.join(', ') : args);
	var rpcReq = function rpcReq() {
		var ret = obj[fname].apply(obj, args);
		// convert <undefined> result to <null> so RPC lib produces a valid
		// response (it just omits the <result> property otherwise)
		if (ret === undefined) ret = null;
		return ret;
	};
	var rpcCallback = function rpcCallback(err, res) {
		if (err) {
			log.error(err, 'exception in %s', logtag);
		}
		if (typeof callback !== 'function') {
			log.error('%s called without a valid callback', logtag);
		}
		else {
			log.trace('%s finished', logtag);
			res = orProxy.refify(res);  // marshal return value
			return callback(err, res);
		}
	};
	try {
		var rq = RQ.getGlobal('rpc');
		if (obj.tsid && isLocal(obj) && typeof obj.getRQ === 'function') {
			rq = obj.getRQ();
		}
		rq.push(tag, rpcReq, rpcCallback, {waitPers: true});
	}
	catch (err) {
		return rpcCallback(err);
	}
}


/**
 * Wrapper around {@link module:data/rpc~handleRequest|handleRequest}
 * for game object function calls.
 *
 * @param {string} callerId ID of the calling component (for logging)
 * @param {string} tsid TSID of the game object to call the function on
 * @param {string|null} tag ID tag of ongoing request process this RPC belongs
 *        to (if any)
 * @param {string} fname name of the function to call on the object
 * @param {array} args function call arguments
 * @param {function} callback callback for the RPC library, returning
 *        the result (or errors) to the remote caller
 */
function objectRequest(callerId, tsid, tag, fname, args, callback) {
	// backwards compatibility with external components
	if (arguments.length === 5) {
		callback = args;
		args = fname;
		fname = tag;
		tag = util.format('%s.%s.%s', callerId, tsid, fname);
	}
	RQ.getGlobal('persget').push('rpc.get.' + tsid,
		pers.get.bind(null, tsid),
		function cb(err, obj) {
			if (err) {
				log.error(err, 'error loading %s for RPC', tsid);
				return;
			}
			handleRequest(callerId, obj, tag, fname, args, callback);
		}
	);
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
	var globalApi = require('model/globalApi');
	handleRequest(callerId, globalApi, null, fname, args, callback);
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
	var gsjsBridge = require('model/gsjsBridge');
	handleRequest(callerId, gsjsBridge.getAdmin(), null, fname, [argsObject],
		callback);
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
	var rpcApi = require('data/rpcApi');
	handleRequest(callerId, rpcApi, null, fname, args, callback);
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
	// locations, geos and groups mapped by their own tsid
	if (utils.isLoc(objOrTsid) || utils.isGroup(objOrTsid) || utils.isGeo(objOrTsid)) {
		return config.mapToGS(objOrTsid).gsid;
	}
	// for all other classes, we need the actual game object
	var obj = typeof objOrTsid === 'string' ? pers.get(objOrTsid) : objOrTsid;
	assert(typeof obj === 'object' && obj !== null,
		'cannot map nonexistent game object: ' + objOrTsid);
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
	// quests or DCs mapped by their owner (location, player/bag/item or group)
	if (utils.isQuest(obj) || utils.isDC(obj)) {
		assert(utils.isLoc(obj.owner) || utils.isItem(obj.owner) ||
			utils.isGroup(obj.owner),
			util.format('invalid owner for %s: %s', obj, obj.owner));
		return getGsid(obj.owner);
	}
	throw new Error('invalid game object type: ' + objOrTsid);
}


/**
 * Generates a TSID for a game object that will be mapped to this game
 * server instance. *Only works for group, location and geo objects.*
 * This is essentially a naive/brute force loop application of {@link
 * module:utils~makeTsid|utils.makeTsid}.
 *
 * @param {string} initial first letter of the returned TSID,
 *        corresponding to a game object type; must be 'G', 'L' or 'R'
 * @returns {string} the generated game object TSID
 * @throws {AssertionError} if an invalid `initial` was supplied
 */
function makeLocalTsid(initial) {
	//TODO: this is a hack that does not scale to more than a handful of GSs
	var tsid;
	while (!tsid || !isLocal(tsid)) {
		tsid = utils.makeTsid(initial, config.getGsid());
	}
	return tsid;
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
		log.info('[jrpc client for %s] connection ended', gsid);
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
/*jshint +W072 */
