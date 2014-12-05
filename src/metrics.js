'use strict';

/**
 * Wrapper around the {@link https://github.com/dscape/lynx|lynx}
 * statsd client library. Forwards basic functionality and offers some
 * convenience functions top.
 *
 * @module
 */


// public interface
module.exports = {
	init: init,
	increment: increment,
	decrement: decrement,
	createTimer: createTimer,
	setupGaugeInterval: setupGaugeInterval,
	setupTimerInterval: setupTimerInterval,
};


require('harmony-reflect');
var config = require('config');
var Lynx = require('lynx');

var STATSD_FLUSH_INT = 10000;  // statsd flush interval in ms

var lynx = getMockLynx();
var intervals = {};


/**
 * Initializes the statsd client (if monitoring is enabled in the GS
 * configuration).
 */
function init() {
	intervals = {};
	var cfg = config.get('mon:statsd');
	if (!cfg.enabled) {
		log.info('monitoring disabled, using mock statsd client');
	}
	else {
		var scope = (cfg.prefix ? cfg.prefix + '.' : '') + config.getGsid();
		log.info('initializing statsd client (scope: %s)', scope);
		lynx = new Lynx(
			config.get('mon:statsd:host'), config.get('mon:statsd:port'),
			{scope: scope, on_error: lynxErrorHandler});
	}
	startSystemMetrics();
}


function lynxErrorHandler(err) {
	// crude way of filtering out unnecessary errors for stats that aren't sent
	// because of their sample rate
	// see: https://github.com/dscape/lynx/issues/10
	if (err.message !== 'Nothing to send') {
		log.error(err, 'error in statsd client');
	}
}


/**
 * Creates a mock statsd client object that just trace logs incoming
 * stats instead of sending them off. Suitable for testing or when
 * monitoring is disabled.
 *
 * @private
 */
function getMockLynx() {
	return new Proxy({}, {
		get: function get(target, name, receiver) {
			return function dummy() {
				if (global.log) {
					log.trace({fname: name, args: arguments}, 'statsd call');
				}
			};
		},
	});
}


/**
 * Increment a counter metric by 1.
 * see {@link https://github.com/dscape/lynx/ lynx} and {@link
 * https://github.com/etsy/statsd statsd} docs for details.
 */
function increment(stats, sampleRate) {
	return lynx.increment(stats, sampleRate);
}


/**
 * Decrement a counter metric by 1.
 * see {@link https://github.com/dscape/lynx/ lynx} and {@link
 * https://github.com/etsy/statsd statsd} docs for details.
 */
function decrement(stats, sampleRate) {
	return lynx.decrement(stats, sampleRate);
}


/**
 * Create a timer object for timing measurements.
 * see {@link https://github.com/dscape/lynx/ lynx} and {@link
 * https://github.com/etsy/statsd statsd} docs for details.
 *
 * NB: returns `undefined` in case monitoring is not enabled;
 * callers need to handle that case.
 */
function createTimer(stat, sampleRate) {
	return lynx.createTimer(stat, sampleRate);
}


/**
 * Sets up an interval for periodic collection of a gauge metric.
 *
 * @param {string} stat name of the metric
 * @param {function} valueGetter called to retrieve the current gauge
 *        value when the interval fires (no arguments, must return a
 *        single numeric value)
 * @param {number} [sampleRate] metric sample rate (must be between
 *        0 and 1; defaults to 1, i.e. no sampling)
 * @param {number} [delay] period between metric generation calls
 *        (default statsd flush interval by default)
 */
function setupGaugeInterval(stat, valueGetter, sampleRate, delay) {
	setupInterval(stat, 'gauge', delay, function gauge() {
		lynx.gauge(stat, valueGetter(), sampleRate);
	});
}


/**
 * Sets up an interval for periodic collection of a timing metric.
 * The timer object is created when the interval fires, and passed
 * to the given `resolver` function.
 *
 * @param {string} stat name of the metric
 * @param {function} resolver takes a timer object as its only
 *        argument; expected to stop the timer once whatever is being
 *        measured has finished
 * @param {number} [sampleRate] metric sample rate (must be between
 *        0 and 1; defaults to 1, i.e. no sampling)
 * @param {number} [delay] period between metric generation calls
 *        (default statsd flush interval by default)
 */
function setupTimerInterval(stat, resolver, sampleRate, delay) {
	setupInterval(stat, 'timer', delay, function timer() {
		resolver(createTimer(stat, sampleRate));
	});
}


/**
 * Sets up an interval for periodic collection of arbitrary metrics.
 * If an interval for the given metric already exists, it is removed
 * and recreated.
 *
 * @param {string} stat name of the metric
 * @param {string} type metric type (must be "gauge" or "timer"; will
 *        be used as part of the metric name sent to statsd)
 * @param {number} delay stats generation period in ms (defaults to
 *        the default statsd flush interval of 10s if undefined)
 * @param {function} func a function generating and submitting the
 *        metric (no arguments, no return value)
 * @private
 */
function setupInterval(stat, type, delay, func) {
	delay = delay || STATSD_FLUSH_INT;
	var id = type + '.' + stat;
	if (id in intervals) {
		log.info('replacing %s interval for %s', type, stat);
		clearInterval(intervals[id]);
	}
	else {
		log.info('setting up %s interval for %s', type, stat);
	}
	var intObj = setInterval(func, delay);
	intervals[id] = intObj;
}


/**
 * Sets up periodic collection of system level metrics (memory, system
 * load etc.).
 * @private
 */
function startSystemMetrics() {
	// process memory gauges
	/*jshint -W083 */  // ok to make function within this (specific, run-once) loop
	for (var k in process.memoryUsage()) {
		setupGaugeInterval('process.memory.' + k, function getter() {
			return process.memoryUsage()[k];
		});
	}
	/*jshint +W083 */
	// naive event loop latency
	setupTimerInterval('process.eventLoopLatency', function resolver(timer) {
		setImmediate(function stop() {
			timer.stop();
		});
	}, undefined, 1000);
}
