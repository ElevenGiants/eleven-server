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
};


var net = require('net');
var repl = require('repl');
var vm = require('vm');
var config = require('config');
var pers = require('data/pers');
var RC = require('data/RequestContext');
var gsjsBridge = require('model/gsjsBridge');
var globalApi = require('model/globalApi');
var rpcApi = require('data/rpcApi');


function init() {
	var port = config.getServicePort('debug:repl:basePort');
	var host = config.get('debug:repl:host');
	var server = net.createServer(handleConnect).listen(port, host);
	server.on('listening', function onListening() {
		log.info('debugging REPL listening on %s:%s', host, port);
	});
}


function handleConnect(socket) {
	var addr = socket.remoteAddress + ':' + socket.remotePort;
	log.info('REPL connection opened: %s', addr);
	var r = repl.start({
		prompt: config.getGsid() + '> ',
		input: socket,
		output: socket,
		terminal: true,
		eval: getReplEval(addr, socket),
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
}


function getReplEval(addr, socket) {
	return function replEval(code, context, file, replCallback) {
		log.trace({client: addr}, code);
		var script;
		// create Script object to check syntax
		try {
			script = vm.createScript(code, {
				filename: file,
				displayErrors: false,
			});
		}
		catch (e) {
			log.trace({client: addr}, 'parse error: %s', e.message);
			return replCallback(e);
		}
		// run Script in a separate request context (so changes are persisted
		// and errors can be handled safely)
		log.info({client: addr}, code);
		var rc = new RC('repl', addr);
		rc.run(
			function replEval() {
				return script.runInContext(context, {displayErrors: false});
			},
			function cb(err, res) {
				// the REPL callback handler may run into unexpected problems,
				// e.g. when trying to stringify a return value that contains
				// broken objrefs
				try {
					return replCallback(err, res);
				}
				catch (e) {
					log.error(e, 'unhandled error in REPL callback: %s', e.message);
					if (socket && typeof socket.destroy === 'function') {
						log.info('closing REPL connection after error: %s', addr);
						socket.destroy();
					}
				}
			}, true
		);
	};
}
