'use strict';

/**
 * Initialization/startup and shutdown functionality for GS worker
 * processes.
 *
 * @module
 */

// public interface
module.exports = {
	run: run,
};


var auth = require('comm/auth');
var async = require('async');
var config = require('config');
var gsjsBridge = require('model/gsjsBridge');
var pers = require('data/pers');
var rpc = require('data/rpc');
var RQ = require('data/RequestQueue');
var amfServer = require('comm/amfServer');
var metrics = require('metrics');
var replServer = require('comm/replServer');
var logging = require('logging');
var slackChat = require('comm/slackChat');
var util = require('util');
var segfaultHandler = require('segfault-handler');


var shuttingDown = false;


/**
 * Worker process entry point. Called as soon as common low-level
 * infrastructure (logging etc.) has been initialized in `server.js`.
 */
function run() {
	log.info('starting cluster worker %s', config.getGsid());
	segfaultHandler.registerHandler();
	RQ.init();
	// initialize and wait for modules required for GS operation
	async.series([
			persInit,
			authInit,
			rpcInit,
		],
		function callback(err, res) {
			if (err) throw err;  // bail if anything went wrong
			// otherwise, start listening for requests
			process.on('message', onMessage);
			// bind SIGINT here too, because it is also sent to child processes
			// when running the GS from the command line and pressing ctrl+c
			process.on('SIGINT', shutdown);
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
	if (config.get('slack:chat:token', null)) {
		slackChat.init();
	}
	startGCInterval();
}


function onMessage(msg) {
	if (msg === 'shutdown') {
		log.debug('shutdown request received');
		shutdown();
	}
}


/**
 * Starts the explicit GC interval (if configured).
 *
 * @private
 */
function startGCInterval() {
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


function shutdown() {
	if (shuttingDown) {
		return log.warn('graceful shutdown already in progress');
	}
	log.info('initiating graceful shutdown');
	shuttingDown = true;
	rpc.preShutdown();
	async.series([
		// first, close and disconnect all client sessions
		amfServer.close,
		// then close all request queues
		RQ.shutdown,
		// then shut down RPC and persistence layer
		rpc.shutdown,
		pers.shutdown,
		// then everything else can go (no more incoming requests possible)
		function finish(cb) {
			async.parallel([
				slackChat.shutdown,
				replServer.shutdown,
				metrics.shutdown,
			], cb);
		},
	], function done(err, results) {
		if (err) {
			log.error(err, 'graceful shutdown failed');
		}
		else {
			log.info('graceful shutdown finished');
		}
		logging.end(process.exit, err ? 1 : 0);
	});
}
