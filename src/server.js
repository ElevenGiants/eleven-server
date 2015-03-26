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

var cluster = require('cluster');
var config = require('config');
var policyServer = require('comm/policyServer');
var logging = require('logging');
var metrics = require('metrics');
var util = require('util');
var worker = require('worker');


var workers = {};
var shutdownTimers = {};


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
	// then actually fork workers, resp. defer to worker module there
	if (cluster.isMaster) runMaster();
	else worker.run();
}


function runMaster() {
	log.info('starting cluster master %s', config.getGsid());
	config.forEachLocalGS(function forkChild(gsconf) {
		var id = gsconf.gsid;
		log.info('forking child process %s (%s)', id, gsconf.hostPort);
		var env = {gsid: id};
		workers[id] = cluster.fork(env);
	});
	policyServer.start();
	process.on('SIGINT', shutdown);
	process.on('SIGTERM', shutdown);
}


/**
 * Handles SIGTERM/SIGINT by attempting to gracefully shut down all
 * worker processes, and disconnecting or eventually killing them if
 * they do not comply within the configured timeouts.
 *
 * @private
 */
function shutdown() {
	log.info('shutdown signal received');
	Object.keys(workers).forEach(function shutdownWorker(gsid) {
		var worker = workers[gsid];
		var logtag = util.format('worker %s (%s)', worker.id, gsid);
		shutdownTimers[worker.id] = setTimeout(killWorker,
			config.get('proc:shutdownTimeout'), worker, gsid);
		log.info('sending shutdown message to %s', logtag);
		try {
			worker.send('shutdown');
		}
		catch (err) {
			log.error(err, 'failed to send shutdown message to %s', logtag);
		}
	});
	waitForWorkerShutdown(new Date().getTime());
}


/**
 * Tries to terminate a worker process with increasing insistence:
 * first by calling `worker.kill()`, then by sending `SIGTERM` and
 * finally `SIGKILL` (with timeouts in between).
 *
 * @param {object} worker the node cluster worker object to terminate
 * @param {string} gsid ID string of the GS worker process (just for
 *        log messages)
 * @param {number} [step] internal indicator for the current step in
 *        the shutdown operation sequence
 * @private
 */
function killWorker(worker, gsid, step) {
	step = step || 0;
	var pid = worker.process.pid;
	var logtag = util.format('worker %s (%s/pid:%s)', worker.id, gsid, pid);
	log.warn('shutdown timeout #%s for %s', step, logtag);
	if (step < 2) {
		shutdownTimers[worker.id] = setTimeout(killWorker,
			config.get('proc:killTimeout'), worker, gsid, step + 1);
	}
	try {
		switch (step) {
			case 0:
				log.info('calling kill() on %s', logtag);
				worker.kill();
				break;
			case 1:
				log.info('sending SIGTERM to %s', logtag);
				process.kill(pid, 'SIGTERM');
				break;
			case 2:
				log.info('sending SIGKILL to %s', logtag);
				process.kill(pid, 'SIGKILL');
				break;
		}
	}
	catch (err) {
		log.error(err, 'failure during shutdown step %s', step);
		// proceed to next step immediately
		clearTimeout(shutdownTimers[worker.id]);
		delete shutdownTimers[worker.id];
		if (step < 2) {
			setImmediate(killWorker, worker, gsid, step + 1);
		}
	}
}


/**
 * Exits the process if all workers have exited, or the global shutdown
 * timeout has been exceeded. Otherwise, schedules itself again for
 * periodic shutdown status log output.
 *
 * @private
 */
function waitForWorkerShutdown(start) {
	if (new Date().getTime() - start > config.get('proc:masterTimeout')) {
		log.error('could not shut down/kill all workers. Giving up.');
		logging.end(process.exit, 1);
	}
	var n = Object.keys(cluster.workers).length;
	if (n > 0) {
		log.info('waiting for %s worker(s) to shut down...', n);
		setTimeout(waitForWorkerShutdown, 1000, start);
	}
	else {
		log.info('all workers gone. Bye.');
		logging.end(process.exit);
	}
}


if (cluster.isMaster) {
	cluster.on('disconnect', function onDisconnect(worker) {
		log.info('worker %s disconnected', worker.id);
	});
	cluster.on('exit', function onExit(worker, code, signal) {
		log.info('worker %s exited (code %s/signal %s)', worker.id, code, signal);
		clearTimeout(shutdownTimers[worker.id]);
		delete shutdownTimers[worker.id];
	});
}


// uncaught error handler; log as FATAL error and quit
process.on('uncaughtException', function onUncaughtException(err) {
	if (typeof err === 'object' && err.type === 'stack_overflow') {
		// special treatment for stack overflow errors
		// see https://github.com/trentm/node-bunyan/issues/127
		err = new Error(err.message);
	}
	log.fatal(err, 'uncaught error');
	logging.end(process.exit, 1);
});


if (require.main === module) {
	main();
}
