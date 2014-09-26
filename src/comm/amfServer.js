'use strict';

/**
 * Accepts TCP connections from game clients and binds them to
 * {@link Session} instances.
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
	sessionMgr.newSession(socket);
}
