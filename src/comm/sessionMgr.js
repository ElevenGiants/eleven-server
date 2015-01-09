'use strict';

/**
 * Client session management module.
 *
 * @module
 */

// public interface
module.exports = {
	init: init,
	newSession: newSession,
	getSessionCount: getSessionCount,
	forEachSession: forEachSession,
	sendToAll: sendToAll,
};


var async = require('async');
var Session = require('comm/Session');
var metrics = require('metrics');

var sessions = {};


function init() {
	sessions = {};
	metrics.setupGaugeInterval('session.count', getSessionCount);
}


function newSession(socket) {
	var id;
	do {
		id = (+new Date()).toString(36);
	}
	while (id in sessions);
	var session = new Session(id, socket);
	sessions[id] = session;
	session.on('close', onSessionClose);
	return session;
}


function onSessionClose(session) {
	log.info('unlink %s', session);
	delete sessions[session.id];
}


/**
 * Gets the number of currently active client sessions (active meaning
 * connected, not necessarily logged in).
 *
 * @returns {number} the active session count
 */
function getSessionCount() {
	if (!sessions) return 0;
	return Object.keys(sessions).length;
}


/**
 * Asynchronously calls a given function for each session.
 *
 * @param {function} func
 * ```
 * func(session, callback)
 * ```
 * function to call for each session; `callback(err)` must be called
 * once the function has completed or an error has occurred
 * @param {function} [callback]
 * ```
 * callback(err)
 * ```
 * called when all function calls have finished, or when an error
 * occurs in any of them; `err` is an `Error` object or `null`
 */
function forEachSession(func, callback) {
	async.eachLimit(Object.keys(sessions), 10, function iterator(id, cb) {
		var session = sessions[id];
		func.call(session, session, cb);
	}, callback);
}


/**
 * Asynchronously sends a message to all logged in clients. Errors
 * sending to single clients do not stop the distribution process.
 *
 * @param {object} msg the message to send
 * @param {function} [done] called when all messages have been sent
 *        (no feedback regarding delivery success!)
 */
function sendToAll(msg, done) {
	forEachSession(
		function send(session, cb) {
			if (session.loggedIn) {
				log.debug('sending god message to %s', session);
				try {
					session.send(msg);
				}
				catch (e) {
					log.error(e, 'error sending god message to %s', session);
				}
			}
			cb();
		},
		function callback(err) {
			if (err) {
				log.error(err, 'error sending message to connected clients');
			}
			if (done) done();
		}
	);
}
