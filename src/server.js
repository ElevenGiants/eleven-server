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
var rpc = require('data/rpc');
var slack = require('comm/slackNotify');
var util = require('util');
var worker = require('worker');


var workers = {};
var shutdownTimers = {};
var clusterShutdown = false;
var heartbeats = {};
var heartbeatInt = 0;
var heartbeatTimeout = 0;


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
	heartbeatInt = config.get('net:heartbeat:interval', 0);
	heartbeatTimeout = config.get('net:heartbeat:timeout', 0);
	logging.init();
	metrics.init();
	// then actually fork workers, resp. defer to worker module there
	if (cluster.isMaster) runMaster();
	else worker.run();
}


function runMaster() {
	log.info('starting cluster master %s', config.getGsid());
	cluster.schedulingPolicy = cluster.SCHED_NONE;
	config.forEachLocalGS(startWorker);
	policyServer.start();
	process.on('SIGINT', shutdown);
	process.on('SIGTERM', shutdown);
	rpc.init(function cb(err) {
		if (err) throw err;
		log.info('RPC connections established');
		if (heartbeatInt) {
			config.forEachLocalGS(startHeartbeat);
			setInterval(checkHeartbeats, heartbeatInt);
		}
	});
	if (config.get('slack:notify:webhookUrl', null)) {
		slack.init();
	}
}


function startWorker(gsconf) {
	var gsid = gsconf.gsid;
	log.info('forking child process %s (%s)', gsid, gsconf.hostPort);
	var env = {gsid: gsid};
	workers[gsid] = cluster.fork(env);
}


function startHeartbeat(gsconf) {
	var gsid = gsconf.gsid;
	log.info('(re)starting heartbeat interval for %s', gsid);
	var restart = gsid in heartbeats;
	heartbeats[gsid] = {last: Date.now()};
	heartbeats[gsid].handle = setInterval(function ping() {
		log.trace('heartbeat ping %s', gsid);
		rpc.sendRequest(gsid, 'gs', ['ping', []], function cb(err) {
			if (err) {
				log.info(err, 'heartbeat ping failed for %s', gsid);
			}
			else {
				log.trace('heartbeat pong %s', gsid);
				heartbeats[gsid].last = Date.now();
				if (restart) {
					slack.info('%s reconnected (pid %s)', gsid,
						workers[gsid].process.pid);
					restart = false;
				}
			}
		});
	}, heartbeatInt);
}


function stopHeartbeat(gsid) {
	if (heartbeats[gsid].handle) {
		clearInterval(heartbeats[gsid].handle);
		delete heartbeats[gsid].handle;
	}
}


function checkHeartbeats() {
	log.trace('checking heartbeat timestamps');
	var now = Date.now();
	config.forEachLocalGS(function check(gsconf, callback) {
		var gsid = gsconf.gsid;
		if (heartbeats[gsid].handle) {
			var age = now - heartbeats[gsid].last;
			log.trace('last heartbeat for %s: %s ms', gsid, age);
			if (age > heartbeatTimeout) {
				log.error('last heartbeat for %s was %s ms ago; restarting',
					gsid, age);
				slack.warning('lost contact to %s (pid %s; last heartbeat: ' +
					'%s ms ago)', gsid, workers[gsid].process.pid, age);
				stopHeartbeat(gsid);
				shutdownWorker(gsid);
			}
		}
	});
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
	clusterShutdown = true;
	Object.keys(workers).forEach(shutdownWorker);
	waitForWorkerShutdown(new Date().getTime());
}


function shutdownWorker(gsid) {
	var worker = workers[gsid];
	var logtag = util.format('worker %s (%s)', worker.id, gsid);
	shutdownTimers[worker.id] = setTimeout(killWorker,
		config.get('proc:shutdownTimeout'), worker, gsid);
	log.info('sending shutdown message to %s', logtag);
	// TODO: as of node v0.12/io.js, we could use worker.isConnected and
	// worker.isDead to avoid unnecessary ERROR messages
	try {
		worker.send('shutdown');
	}
	catch (err) {
		log.error(err, 'failed to send shutdown message to %s', logtag);
	}
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


/**
 * Helper function to retrieve the GSID for a node cluster worker
 * object.
 *
 * @private
 */
function getGsid(worker) {
	for (var gsid in workers) {
		if (workers[gsid] === worker) {
			return gsid;
		}
	}
}


if (cluster.isMaster) {
	cluster.on('disconnect', function onDisconnect(worker) {
		log.info('worker %s (%s) disconnected', worker.id, getGsid(worker));
	});
	cluster.on('exit', function onExit(worker, code, signal) {
		var gsid = getGsid(worker);
		log.info('%s exited (code %s/signal %s)', gsid, code, signal);
		clearTimeout(shutdownTimers[worker.id]);
		delete shutdownTimers[worker.id];
		if (!clusterShutdown) {
			log.info('restarting %s', gsid);
			slack.warning('restarting %s (pid %s exited; code %s/signal %s)',
				gsid, worker.process.pid, code, signal);
			var gsconf = config.getGSConf(gsid);
			stopHeartbeat(gsid);
			startWorker(gsconf);
			startHeartbeat(gsconf);
		}
	});
}


// uncaught error handler; log as FATAL error and quit
process.on('uncaughtException', function onUncaughtException(err) {
	if (global.log) {
		log.fatal(err, 'uncaught error');
		logging.end(process.exit, 1);
	}
	else {
		console.error(err.stack);
	}
});


if (require.main === module) {
	main();
}
