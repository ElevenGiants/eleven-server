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
	close: close,
};


var net = require('net');
var WebSocket = require('ws');
var config = require('config');
var sessionMgr = require('comm/sessionMgr');

var server;


function start() {
	sessionMgr.init();
	var gsconf = config.getGSConf();
	server = new WebSocket.Server({port: gsconf.port});
	server.on('listening', function onListening() {
		log.info('%s ready (pid=%s)', config.getGsid(), process.pid);
	});
	server.on('connection', handleConnect);
}


function close(callback) {
	log.info('WS server shutdown');
	server.close(callback);
	sessionMgr.shutdown();
}


function handleConnect(socket, req) {
	sessionMgr.newSession(socket, req);
}
