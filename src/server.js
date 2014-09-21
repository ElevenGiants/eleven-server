'use strict';

/**
 * Main game server entry point: all GS instances (master and worker)
 * are started through this module.
 *
 * Running the module directly creates the cluster master process,
 * which in turn forks worker GS processes according to the {@link
 * module:config|config}. The unique server ID for each worker is
 * passed in the environment variable `gsid`.
 *
 * @module
 */

var assert = require('assert');
var bunyan = require('bunyan');
var cluster = require('cluster');
var config = require('config');
var fs = require('fs');
var gsjsBridge = require('model/gsjsBridge');
var path = require('path');
var rpc = require('data/rpc');
var sessionMgr = require('comm/sessionMgr');


var cfg;  // buffer for the loaded configuration (for convenience)


/**
 * Main entry point - this function is called when running:
 * ```
 * node server.js
 * ```
 *
 * @private
 */
function main() {
	config.init(cluster.isMaster);
	cfg = config.get();
	logInit();
	if (cluster.isMaster) {
		runMaster();
	}
	else {
		runWorker();
	}
	gsjsBridge.init(function callback(err) {
		if (err) log.error(err, 'GSJS bridge initialization failed');
		else log.info('GSJS prototypes loaded');
	});
	rpc.init(function callback(err) {
		if (err) log.error(err, 'RPC initialization failed');
		else log.info('RPC connections established');
	});
}


/**
 * Initializes logging for this GS process.
 *
 * @private
 */
function logInit() {
	var gsid = config.getGsid();
	assert(typeof gsid === 'string' && gsid.length > 0, 'invalid GSID: ' + gsid);
	var dir = path.resolve(path.join(cfg.log.dir));
	try {
		fs.mkdirSync(dir);
	}
	catch (e) {
		if (e.code !== 'EEXIST') throw e;
	}
	global.log = bunyan.createLogger({
		name: gsid,
		src: cfg.log.includeLoc,
		streams: [
			{
				level: cfg.log.level.stdout,
				stream: process.stdout,
			},
			{
				level: cfg.log.level.file,
				path: path.join(dir, gsid + '-default.log'),
			},
			{
				level: 'error',
				path: path.join(dir, gsid + '-errors.log'),
			},
		],
	});
}


function runMaster() {
	log.info('starting cluster master %s', config.getGsid());
	config.forEachLocalGS(function forkChild(gsconf) {
		var id = gsconf.gsid;
		log.info('forking child process %s (%s)', id, gsconf.hostPort);
		var env = {gsid: id};
		cluster.fork(env);
	});
}


function runWorker() {
	log.info('starting cluster worker %s', config.getGsid());
	// start dummy echo server (temporary code, obviously)
	sessionMgr.init();
	var gsconf = config.getGSConf();
	require('net').createServer(function(socket) {
		sessionMgr.newSession(socket,
			function dataHandler(session, data) {
				socket.write(data);  // simple echo
			}
		);
	}).listen(gsconf.port, gsconf.host);
	log.info('%s ready, listening on %s', gsconf.gsid, gsconf.hostPort);
}


if (require.main === module) {
	main();
}
