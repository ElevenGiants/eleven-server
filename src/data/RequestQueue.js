'use strict';

module.exports = RequestQueue;

var events = require('events');
var metrics = require('metrics');
var RC = require('data/RequestContext');
var util = require('util');


/**
 * Generic request processing helper, managing sequential, one-by-one execution
 * of requests (received as `function` objects through {@link RequestQueue#push|
 * push}).
 *
 * @param {GameObject|undefined} owner game object that this queue is logically
 *        assigned to
 * @param {domain} [domain] for wrapping request execution in a
 *        {@link https://nodejs.org/docs/latest/api/domain.html|node.js domain}
 *
 * @constructor
 */
function RequestQueue(owner, domain) {
	RequestQueue.super_.call(this);
	this.queue = [];
	this.busy = false;
	this.owner = owner;
	this.domain = domain;
}
util.inherits(RequestQueue, events.EventEmitter);


/**
 * Retrieves the current request queue length.
 *
 * @returns {number} the current queue length
 */
RequestQueue.prototype.getLength = function getLength() {
	return this.queue ? this.queue.length : 0;
};


/**
 * Adds a new request to the queue.
 *
 * @param {string} tag arbitrary brief text describing the request (for logging)
 * @param {function} func the request function to be executed
 * @param {Session|undefined} session client session where the request
 *        originated (if applicable)
 * @param {function} [callback]
 * ```
 * callback(error, result)
 * ```
 * for getting back the request function result, or errors that occurred during
 * its execution (if not specified, errors and/or the result are lost)
 */
RequestQueue.prototype.push = function push(tag, func, session, callback) {
	var timer = metrics.createTimer('req.wait', 0.1);
	this.queue.push({
		tag: tag,
		func: func,
		session: session,
		callback: callback,
		waitTimer: timer,
	});
	setImmediate(this.next.bind(this));
};


/**
 * Checks if there are any pending requests, and triggers execution of the next
 * one if so.
 *
 * @private
 */
RequestQueue.prototype.next = function next() {
	log.trace({len: this.queue.length}, 'checking for next request');
	if (!this.busy && this.queue.length) {
		var req = this.queue.shift();
		if (this.domain) {
			this.domain.run(this.handle.bind(this, req));
		}
		else {
			this.handle(req);
		}
	}
};


/**
 * Handles a request.
 *
 * @param {object} req the request to handle (an object previously added to the
 *        queue by {@link RequestQueue#push|push})
 * @private
 */
RequestQueue.prototype.handle = function handle(req) {
	if (req.waitTimer) req.waitTimer.stop();
	log.trace('handling %s request', req.tag);
	this.busy = true;
	var self = this;
	var rc = new RC(req.tag, this.owner, req.session);
	rc.run(
		req.func,
		function callback(err, res) {
			self.busy = false;
			log.trace('finished %s request', req.tag);
			setImmediate(self.next.bind(self));
			if (req.callback) return req.callback(err, res);
		}
	);
};
