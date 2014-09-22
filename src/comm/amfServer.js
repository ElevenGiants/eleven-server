'use strict';

/**
 * Accepts TCP connections from game clients and handles incoming
 * requests (mainly AMF parsing and dispatching messages to GSJS).
 *
 * @module
 */

// public interface
module.exports = {
	start: start,
};


var net = require('net');
var config = require('config');
var sessionMgr = require('comm/sessionMgr');

var server;


function start(host, port) {
	sessionMgr.init();
	var gsconf = config.getGSConf();
	server = net.createServer(handleConnect).listen(gsconf.port, gsconf.host);
	server.on('listening', function onListening() {
		log.info('%s ready (pid=%s)', config.getGsid(), process.pid);
	});
}


function handleConnect(socket) {
	sessionMgr.newSession(socket,
		function dataHandler(session, data) {
			socket.write(data);  // simple echo
		}
	);
}
