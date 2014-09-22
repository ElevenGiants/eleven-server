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
var async = require('async');
var bunyan = require('bunyan');
var cluster = require('cluster');
var config = require('config');
var fs = require('fs');
var gsjsBridge = require('model/gsjsBridge');
var path = require('path');
var pers = require('data/pers');
var rpc = require('data/rpc');
var amfServer = require('comm/amfServer');


/**
 * Main entry point - this function is called when running:
 * ```
 * node server.js
 * ```
 *
 * @private
 */
function main() {
	// init low-level things first (synchronously)
	config.init(cluster.isMaster);
	logInit();
	// then actually fork workers, resp. start up server components there
	if (cluster.isMaster) runMaster();
	else runWorker();
}


/**
 * Initializes logging for this GS process.
 *
 * @private
 */
function logInit() {
	var gsid = config.getGsid();
	var cfg = config.get('log');
	assert(typeof gsid === 'string' && gsid.length > 0, 'invalid GSID: ' + gsid);
	var dir = path.resolve(path.join(cfg.dir));
	try {
		fs.mkdirSync(dir);
	}
	catch (e) {
		if (e.code !== 'EEXIST') throw e;
	}
	global.log = bunyan.createLogger({
		name: gsid,
		src: cfg.includeLoc,
		streams: [
			{
				level: cfg.level.stdout,
				stream: process.stdout,
			},
			{
				level: cfg.level.file,
				path: path.join(dir, gsid + '-default.log'),
			},
			{
				level: 'error',
				path: path.join(dir, gsid + '-errors.log'),
			},
		],
	});
}


function persInit(callback) {
	var mod = config.get('pers:backEnd:module');
	var pbe;
	try {
		pbe = require('data/pbe/' + mod);
	}
	catch (e) {
		throw new config.ConfigError('could not load persistence back-end ' +
			'module: ' + e.message);
	}
	var pbeConfig = config.get('pers:backEnd:config:' + mod);
	pers.init(pbe, pbeConfig, function cb(err, res) {
		if (err) log.error(err, 'persistence layer initialization failed');
		else log.info('persistence layer initialized');
		callback(err);
	});
}


function rpcInit(callback) {
	rpc.init(function cb(err) {
		if (err) log.error(err, 'RPC initialization failed');
		else log.info('RPC connections established');
		callback(err);
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
	// initialize and wait for modules required for GS operation
	async.series([
			persInit,
			rpcInit,
		],
		function callback(err, res) {
			if (err) throw err;  // bail if anything went wrong
			// otherwise, start listening for requests
			amfServer.start();
		}
	);
	// gsjs bridge loads stuff in the background (don't need to wait for it)
	gsjsBridge.init(function callback(err) {
		if (err) log.error(err, 'GSJS bridge initialization failed');
		else log.info('GSJS prototypes loaded');
	});
}


if (require.main === module) {
	main();
}
