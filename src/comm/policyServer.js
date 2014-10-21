'use strict';

/**
 * A very simple Flash "socket policy server". The Flash runtime needs
 * to read this policy from any server before allowing the SWF file
 * (the game client in our case) to establish a TCP socket connection
 * to that server.
 *
 * @see https://www.adobe.com/devnet/flashplayer/articles/socket_policy_files.html
 *
 * @module
 */

// public interface
module.exports = {
	start: start,
};


var net = require('net');
var config = require('config');

var POLICY = '\
<cross-domain-policy>\n\
	<site-control permitted-cross-domain-policies="all" />\n\
	<allow-access-from domain="*" to-ports="*" />\n\
</cross-domain-policy>\n\x00';


function start() {
	var host = config.get('net:gameServers:' + config.getGsid() + ':host');
	var port = config.get('net:flashPolicyPort');
	var server = net.createServer(handleConnect);
	server.listen(port, host, function onListening() {
		log.info('policy server listening on %s:%s', host, port);
	});
}


function handleConnect(socket) {
	socket.on('data', function onData(data) {
		if (data.toString().slice(0, 20) === '<policy-file-request') {
			log.info('Flash policy request from %s:%s',
				socket.remoteAddress, socket.remotePort);
			socket.write(POLICY, 'binary');
		}
		socket.end();
	});
}
