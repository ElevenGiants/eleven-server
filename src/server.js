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

var auth = require('comm/auth');
var async = require('async');
var cluster = require('cluster');
var config = require('config');
var gsjsBridge = require('model/gsjsBridge');
var pers = require('data/pers');
var rpc = require('data/rpc');
var amfServer = require('comm/amfServer');
var policyServer = require('comm/policyServer');
var logging = require('logging');
var metrics = require('metrics');
var replServer = require('comm/replServer');
var slack = require('comm/slack');
var util = require('util');


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
	if (config.get('debug').stackTraceLimit) {
		Error.stackTraceLimit = config.get('debug:stackTraceLimit');
	}
	logging.init();
	metrics.init();
	// then actually fork workers, resp. start up server components there
	if (cluster.isMaster) runMaster();
	else runWorker();
}


function loadPluggable(modPath, logtag) {
	try {
		return require(modPath);
	}
	catch (e) {
		var msg = util.format('could not load pluggable %s module "%s": %s',
			logtag, modPath, e.message);
		throw new config.ConfigError(msg);
	}
}


function persInit(callback) {
	var modName = config.get('pers:backEnd:module');
	var pbe = loadPluggable('data/pbe/' + modName, 'persistence back-end');
	pers.init(pbe, config.get('pers'), function cb(err, res) {
		if (err) log.error(err, 'persistence layer initialization failed');
		else log.info('persistence layer initialized (%s back-end)', modName);
		callback(err);
	});
}


function authInit(callback) {
	var modName = config.get('auth:backEnd:module');
	var mod = loadPluggable('comm/abe/' + modName, 'authentication back-end');
	var abeConfig;  // may stay undefined (no config required for some ABEs)
	if (config.get('auth:backEnd').config) {
		abeConfig = config.get('auth:backEnd').config[modName];
	}
	auth.init(mod, abeConfig, function cb(err) {
		if (err) log.error(err, 'auth layer initialization failed');
		else log.info('auth layer initialized (%s back-end)', modName);
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
	policyServer.start();
}


function runWorker() {
	log.info('starting cluster worker %s', config.getGsid());
	// initialize and wait for modules required for GS operation
	async.series([
			persInit,
			authInit,
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
	// start REPL server if enabled
	if (config.get('debug').repl && config.get('debug:repl:enable')) {
		replServer.init();
	}
	if (config.get('slack:token', null)) {
		slack.init();
	}
	// start explicit GC interval if configured
	var gcInt = config.get('debug:gcInt', null);
	if (gcInt) {
		if (!global.gc) {
			log.error('GC interval configured, but global gc() not available ' +
				'(requires node option --expose_gc)');
		}
		else {
			log.info('starting explicit GC interval (%s ms)', gcInt);
			setInterval(function explicitGC() {
				var timer = metrics.createTimer('process.gc_time');
				global.gc();
				timer.stop();
			}, gcInt);
		}
	}
}


if (require.main === module) {
	main();
}
