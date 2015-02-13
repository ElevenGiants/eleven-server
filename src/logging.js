'use strict';

/**
 * All things logging. Initializes the log library ({@link
 * https://github.com/trentm/node-bunyan|Bunyan}) according to server
 * configuration, and sets up the various log output streams.
 *
 * @module
 */

// public interface
module.exports = {
	init: init,
	logAction: logAction,
	end: end,
};


var assert = require('assert');
var bunyan = require('bunyan');
var config = require('config');
var fs = require('fs');
var path = require('path');
var RC = require('data/RequestContext');
var Session = require('comm/Session');
var metrics = require('metrics');

var logger;
var actionLogger;


/**
 * Initializes logging for this GS process and sets up the global
 * logging handler `log`.
 */
function init() {
	var gsid = config.getGsid();
	var masterGsid = config.getMasterGsid();
	var cfg = config.get('log');
	assert(typeof gsid === 'string' && gsid.length > 0, 'invalid GSID: ' + gsid);
	var dir = path.resolve(path.join(cfg.dir));
	try {
		fs.mkdirSync(dir);
	}
	catch (e) {
		if (e.code !== 'EEXIST') throw e;
	}
	logger = bunyan.createLogger({
		name: gsid,
		src: cfg.includeLoc,
		streams: [
			{
				name: 'stdout',
				level: cfg.level.stdout,
				stream: process.stdout,
			},
			{
				name: 'file',
				level: cfg.level.file,
				path: path.join(dir, masterGsid + '-default.log'),
			},
			{
				name: 'errfile',
				level: 'error',
				path: path.join(dir, masterGsid + '-errors.log'),
			},
		],
		serializers: {
			err: bunyan.stdSerializers.err,
			rc: RC.logSerialize,
			session: Session.logSerialize,
		},
	});
	actionLogger = bunyan.createLogger({
		name: gsid + '-actions',
		streams: [
			{
				level: 'debug',
				path: path.join(dir, masterGsid + '-actions.log'),
			},
		]
	});
	// set up global log handler that transparently wraps bunyan log calls
	global.log = {
		trace: wrapLogEmitter(logger.trace),
		debug: wrapLogEmitter(logger.debug),
		info: wrapLogEmitter(logger.info),
		warn: wrapLogEmitter(logger.warn, 'log.warn'),
		error: wrapLogEmitter(logger.error, 'log.error'),
		fatal: wrapLogEmitter(logger.fatal, 'log.fatal'),
		// pass through other bunyan API functions directly:
		child: logger.child.bind(logger),
		level: logger.level.bind(logger),
		levels: logger.levels.bind(logger),
		reopenFileStreams: logger.reopenFileStreams.bind(logger),
	};
}


/**
 * Helper function for flushing all log streams before exiting the
 * process. No further log output is possible once this function has
 * been called.
 * @see https://github.com/trentm/node-bunyan/issues/37
 *
 * @param {function} done called when finished
 * @param {...*} [args] arbitrary arguments for `done`
 */
function end(done) {
	var doneArgs = Array.prototype.slice.call(arguments, 1);
	// determine number of streams to be closed
	var n = 0;
	for (var i = 0; i < logger.streams.length; i++) {
		if (logger.streams[i].closeOnExit) n++;
	}
	if (n === 0) return done.apply(null, doneArgs);
	// close them and wait for all callbacks
	var c = 0;
	logger.streams.forEach(function closeStream(s) {
		if (s.closeOnExit) {
			s.stream.on('close', function onClose() {
				if (++c >= n) return done.apply(null, doneArgs);
			});
			s.stream.end();
			s.closeOnExit = false;
			s.stream.write = function () {};  // prevent errors on further write attempts
		}
	});
}


function addField(args, name, val) {
	// first arg is an Error -> wrap it in a fields object
	if (args[0] instanceof Error) {
		args[0] = {err: args[0]};
	}
	// handle unexpected input gracefully (probably caller meant to supply an
	// error that wasn't really there)
	if (args[0] === null || args[0] === undefined) {
		args[0] = {};
	}
	// first arg is the log message -> insert an empty fields object
	if (typeof args[0] === 'string') {
		Array.prototype.splice.call(args, 0, 0, {});
	}
	// add the new field
	args[0][name] = val;
}


/**
 * Transparent wrapper for Bunyan log emitter functions (`log.info`,
 * `log.debug` etc). Adds the current request context and session
 * as additional fields if available.
 *
 * This is a partial workaround for
 * {@link https://github.com/trentm/node-bunyan/issues/166}.
 *
 * @param {function} emitter Bunyan log emitter function to wrap
 * @param {string} [metric] statsd counter that is incremented for
 *        each log message written through the emitter
 *
 * @private
 */
function wrapLogEmitter(emitter, metric) {
	return function log() {
		// abort immediately if this log level is not enabled
		if (!emitter.call(logger)) return;
		if (metrics && metric) {
			metrics.increment(metric);
		}
		// add 'rc' and 'session' fields if available
		var rc = RC.getContext(true);
		if (rc) {
			addField(arguments, 'rc', rc);
			if (rc.session) addField(arguments, 'session', rc.session);
		}
		// override bunyan's source code location detection (otherwise it would
		// just always indicate this module/function)
		if (logger.src) addField(arguments, 'src', getCallerInfo());
		return emitter.apply(logger, arguments);
	};
}


/**
 * A copy of Bunyan's `getCaller3Info` function to retrieve log call
 * site information. Duplicated here because otherwise log messages
 * would always show this module as their origin.
 *
 * @private
 */
function getCallerInfo() {
	var obj = {};
	var saveLimit = Error.stackTraceLimit;
	var savePrepare = Error.prepareStackTrace;
	Error.stackTraceLimit = 2;
	var e = new Error();
	Error.captureStackTrace(e, getCallerInfo);
	Error.prepareStackTrace = function (_, stack) {
		var caller = stack[1];
		obj.file = caller.getFileName();
		obj.line = caller.getLineNumber();
		var func = caller.getFunctionName();
		if (func) obj.func = func;
	};
	/*jshint -W030 */  // the following expression triggers prepareStackTrace
	e.stack;
	Error.stackTraceLimit = saveLimit;
	Error.prepareStackTrace = savePrepare;
	return obj;
}


/**
 * Adds game events (like player actions) to a separate log.
 *
 * @param {string} action the type of event to log (should be a short,
 *        all-caps, underscore-separated string)
 * @param {string[]} fields an arbitrary number of data fields adding
 *        more detailed information about the event (should be
 *        formatted as `"name=value"`)
 */
function logAction(action, fields) {
	assert(typeof action === 'string', 'invalid action type: "' + action + '"');
	metrics.increment('log.action.' + action);
	var data = {action: action};
	for (var i = 0; i < fields.length; i++) {
		var field = '' + fields[i];
		var key = field.substr(0, field.indexOf('='));
		var val = field.substr(field.indexOf('=') + 1);
		if (key === '') {
			key = 'UNKNOWN#' + i;
			// val already has the full field content
		}
		data[key] = val;
	}
	if (actionLogger) {
		actionLogger.info(data, action);
	}
	else {
		// fallback if actionLogger not initialized (e.g. during tests)
		log.info(data, 'ACTION LOG: %s', action);
	}
	// TODO: this should probably write to a database instead, since the type of
	// data recorded with this function would more useful in a form that one can
	// run queries on, rather than a sequential list of events
}
