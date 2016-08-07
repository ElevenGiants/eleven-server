'use strict';

/**
 * A TCP socket based live debugging/inspection interface
 * (essentially a glorified wrapper around node's built-in
 * repl module).
 * Gives access to a couple of core GS modules/APIs at
 * runtime; that well-known Spiderman quote applies.
 *
 * See `/tools/repl-client.js` for the client counterpart,
 * and the {@link http://nodejs.org/api/repl.html|Node.js
 * REPL docs} for some usage information.
 *
 * @module
 */


// public interface
module.exports = {
	init: init,
	shutdown: shutdown,
};


var _ = require('lodash');
var net = require('net');
var repl = require('repl');
var util = require('util');
var vm = require('vm');
var bunyan = require('bunyan');
var config = require('config');
var pers = require('data/pers');
var RQ = require('data/RequestQueue');
var gsjsBridge = require('model/gsjsBridge');
var globalApi = require('model/globalApi');
var rpc = require('data/rpc');
var rpcApi = require('data/rpcApi');
var slack = require('comm/slackChat');
var logging = require('logging');
var sessionMgr = require('comm/sessionMgr');

var server;
var connections = [];


function init() {
	var port = config.getServicePort('debug:repl:basePort');
	var host = config.get('debug:repl:host');
	server = net.createServer(handleConnect).listen(port, host);
	server.on('listening', function onListening() {
		log.info('debugging REPL listening on %s:%s', host, port);
	});
}


function shutdown(done) {
	log.info('REPL server shutdown');
	server.close(done);
	for (var k in connections) {
		connections[k].destroy();
	}
}


function handleConnect(socket) {
	var addr = socket.remoteAddress + ':' + socket.remotePort;
	connections[addr] = socket;
	socket.on('close', function close() {
		delete connections[addr];
	});
	log.info('REPL connection opened: %s', addr);
	var r = repl.start({
		prompt: config.getGsid() + '> ',
		input: socket,
		output: socket,
		terminal: true,
		eval: getReplEval(addr, socket),
		writer: function passthrough(data) {
			return data;
		},
	});
	r.on('exit', function onReplExit() {
		socket.end();
		log.info('REPL connection closed: %s', addr);
	});
	// make some things available in the REPL context
	r.context.socket = socket;
	r.context.pers = pers;
	r.context.admin = gsjsBridge.getAdmin();
	r.context.api = globalApi;
	r.context.gsrpc = rpcApi;
	r.context.slack = slack.getClient();
	r.context.rpc = rpc;
	r.context.config = config;
	r.context.logging = logging;
	r.context.bunyan = bunyan;
	r.context.sessionMgr = sessionMgr;
	r.context.rq = RQ;
	r.context.ld = _;
}


function getReplEval(addr, socket) {
	return function replEval(code, context, file, replCallback) {
		log.trace({client: addr}, code);
		// the REPL callback handler may run into unexpected problems, handle those safely
		var guardedCallback = function guardedCallback(err, res) {
			try {
				return replCallback(err, res);
			}
			catch (e) {
				log.error(e, 'unhandled error in REPL callback: %s', e.message);
				if (socket && _.isFunction(socket.destroy)) {
					log.info('closing REPL connection after error: %s', addr);
					socket.destroy();
				}
			}
		};
		// create Script object to check syntax
		var script;
		try {
			script = vm.createScript(code, {
				filename: file,
				displayErrors: false,
			});
		}
		catch (e) {
			log.trace({client: addr}, 'parse error: %s', e.message);
			return guardedCallback(e);
		}
		// run Script in a separate request context
		log.info({client: addr}, code);
		RQ.getGlobal('repl').push('repl.' + addr,
			function req() {
				var res = script.runInContext(context, {displayErrors: false});
				return util.inspect(res, {showHidden: false, depth: 1, colors: true});
			},
			function cb(err, res) {
				if (err) {
					log.error(err, 'error in REPL call: %s', err.message);
				}
				return guardedCallback(err, res);
			},
			{waitPers: true}
		);
	};
}
