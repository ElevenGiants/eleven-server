'use strict';

module.exports = GameObject;


var assert = require('assert');
var config = require('config');
var util = require('util');
var utils = require('utils');
var RC = require('data/RequestContext');


GameObject.prototype.TSID_INITIAL = 'G';

/**
 * Generic constructor for both instantiating an existing game object
 * (from JSON data), and creating a new object.
 *
 * @param {object} [data] initialization values (properties are
 *        shallow-copied into the game object)
 * @constructor
 * @mixes GameObjectApi
 */
function GameObject(data) {
	if (!data) data = {};
	// initialize TSID/class ID (use deprecated properties if necessary, and
	// keep them as non-enumerable so they are available, but not persisted)
	this.tsid = data.tsid || data.id || utils.makeTsid(this.TSID_INITIAL,
		config.getGsid());
	utils.addNonEnumerable(this, 'id', this.tsid);  // deprecated
	if (data.class_tsid || data.class_id) {
		this.class_tsid = data.class_tsid || data.class_id;
		utils.addNonEnumerable(this, 'class_id', this.class_tsid);  // deprecated
	}
	// add non-enumerable internal properties
	utils.addNonEnumerable(this, '__isGO', true);
	utils.addNonEnumerable(this, 'deleted', false);
	// copy supplied data
	// TODO: remove 'dynamic' partition in fixture data, and get rid of special handling here
	var key;
	for (key in data.dynamic) {
		if (!(key in this)) {
			this[key] = data.dynamic[key];
		}
	}
	for (key in data) {
		if (key !== 'dynamic' && !(key in this)) {
			this[key] = data[key];
		}
	}
	this.ts = new Date().getTime();
	if (!this.gsTimers) this.gsTimers = {};
	if (!this.gsTimers.timer) this.gsTimers.timer = {};
	if (!this.gsTimers.interval) this.gsTimers.interval = {};
	utils.makeNonEnumerable(this, 'gsTimers');
}

utils.copyProps(require('model/GameObjectApi').prototype, GameObject.prototype);


/**
 * Creates a processed shallow copy of this game object's data,
 * prepared for serialization.
 *
 * The returned data only contains non-function-type direct ("own")
 * properties whose name does not start with a "!". Complex
 * `object`-type properties (specifically, references to other game
 * objects) are not handled separately here, i.e. the caller may need
 * to replace those with appropriate reference structures before actual
 * serialization (see {@link module:data/objrefProxy~refify|
 * objrefProxy.refify}).
 *
 * @returns {object} shallow copy of the game object, prepared for
 *          serialization
 */
GameObject.prototype.serialize = function serialize() {
	var ret = {};
	var keys = Object.keys(this);  // Object.keys only includes own properties
	for (var i = 0; i < keys.length; i++) {
		var k = keys[i];
		if (k[0] !== '!') {
			var val = this[k];
			if (typeof val !== 'function') {
				ret[k] = val;
			}
		}
	}
	// add timers&intervals (only if there are any)
	var timers;
	Object.keys(this.gsTimers).forEach(function iter(type) {
		for (var key in this.gsTimers[type]) {
			var entry = this.gsTimers[type][key];
			if (entry.options.internal) continue;  // internal timers are not persisted
			if (!timers) {
				timers = {};
			}
			if (!timers[type]) {
				timers[type] = {};
			}
			timers[type][key] = utils.shallowCopy(entry);
			delete timers[type][key].handle;  // no point persisting the handles
		}
	}, this);
	if (timers) ret.gsTimers = timers;
	return ret;
};


/**
 * @returns {string}
 */
GameObject.prototype.toString = function toString() {
	return '[' + this.constructor.name + '#' + this.tsid + ']';
};


/**
 * Schedules this object for deletion after the current request.
 */
GameObject.prototype.del = function del() {
	this.deleted = true;
};


/**
 * Helper function originally defined in <gsjs/common.js>. All the
 * functions there should really be added to all game object prototypes
 * in gsjsBridge (then this here wouldn't be necessary), but that would
 * require prefixing a zillion calls in GSJS code with 'this.'.
 * @private
 */
GameObject.prototype.getProp = function getProp(key) {
	return this[key];
};


/**
 * Helper function originally defined in <gsjs/common.js>. All the
 * functions there should really be added to all game object prototypes
 * in gsjsBridge (then this here wouldn't be necessary), but that would
 * require prefixing a zillion calls in GSJS code with 'this.'.
 * @private
 */
GameObject.prototype.setProp = function setProp(key, val) {
	this[key] = val;
};


/**
 * Helper function originally defined in <gsjs/common.js>. All the
 * functions there should really be added to all game object prototypes
 * in gsjsBridge (then this here wouldn't be necessary), but that would
 * require prefixing a zillion calls in GSJS code with 'this.'.
 * @private
 */
GameObject.prototype.setProps = function setProps(props) {
	for (var k in props) {
		this[k] = props[k];
	}
};


/**
 * Schedules a delayed method call via JS timer/interval on the
 * GameObject.
 *
 * @param {object} options parameter object for the call
 * @param {string} options.fname name of the function to call (must be
 *        a property of this game object)
 * @param {int} options.delay delay before, resp. interval between, the
 *        scheduled function call(s) (in ms)
 * @param {array} [options.args] arguments for the function call
 * @param {boolean} [options.interval] schedules an interval if `true`
 *        (`false`, i.e. one-off delayed call, by default)
 * @param {boolean} [options.multi] schedules a "multi" timer if `true`
 *        (allows scheduling multiple calls for the same method;
 *        `false` by default)
 * @param {boolean} [options.internal] schedules an "internal" timer if
 *        `true` (for internal use in the GS, not persistent; `false`
 *        by default)
 * @return {object} timeout handle as returned by {@link
 *         http://nodejs.org/api/timers.html#timers_settimeout_callback_delay_arg|setTimeout}
 */
GameObject.prototype.setGsTimer = function setGsTimer(options) {
	log.trace('%s.setGsTimer(%s)', this, util.inspect(options, {depth: 1}));
	var logtag = util.format('%s.%s', this, options.fname);
	var type = options.interval ? 'interval' : 'timer';
	assert(!(options.multi && options.interval), 'multi intervals not supported');
	assert(!(options.multi && options.internal), 'internal multi timers not supported');
	assert(typeof this[options.fname] === 'function', 'no such function: ' + logtag);
	if (!options.multi && this.gsTimerExists(options.fname, options.interval)) {
		log.trace('timer/interval already set: %s', logtag);
		return;
	}
	// create key to store timer information with (unique for multi timers)
	var key = options.fname;
	if (options.multi) {
		do {
			key = options.fname + '_' + new Date().getTime();
		}
		while (key in this.gsTimers[type]);
	}
	// schedule timer in a separate request context
	var handle = this.scheduleTimer(options, type, key, this);
	// store data for API functions and saving/restoring timers to/from persistence
	this.gsTimers[type][key] = {
		handle: handle,
		start: new Date().getTime(),
		options: options,
	};
	return handle;
};


/**
 * Helper function for {@link GameObject#setGsTimer|setGsTimer}.
 * Actually schedules the (timer driven) function call, wrapped in a
 * separate {@link RequestContext}.
 *
 * @param {object} options timer call options (see {@link
 *        GameObject#setGsTimer|setGsTimer} for details)
 * @param {string} type timer type (must be "timer" or "interval")
 * @param {string} key unique key for storing/persisting the timer data
 * @private
 */
GameObject.prototype.scheduleTimer = function scheduleTimer(options, type, key) {
	var self = this;
	var handle = (options.interval ? setInterval : setTimeout)(
		function execTimer() {
			var rc = new RC(options.fname, self);
			rc.run(
				function timerCall() {
					log.trace({options: options}, '%s call', type);
					if (!options.interval) {
						delete self.gsTimers[type][key];
					}
					self[options.fname].apply(self, options.args);
				},
				function callback(e) {
					if (e) {
						log.error(e, 'error calling %s.%s via %s', self,
							options.fname, type);
					}
				}
			);
		}, options.delay
	);
	return handle;
};


/**
 * Checks if a timer/interval is currently defined for a given method.
 *
 * @param {string} fname name of the method to check
 * @param {boolean} [interval] if `true`, checks if an interval call is
 *        defined for the given function (otherwise checks for a timer)
 * @returns {boolean} `true` if an interval/timer cal is scheduled
 */
GameObject.prototype.gsTimerExists = function gsTimerExists(fname, interval) {
	var list = interval ? this.gsTimers.interval : this.gsTimers.timer;
	return fname in list && 'handle' in list[fname];  // exists and not fired yet
};


/**
 * Suspends all currently active timers/intervals on the object.
 * This must be called before unloading an object.
 */
GameObject.prototype.suspendGsTimers = function suspendGsTimers() {
	Object.keys(this.gsTimers).forEach(function iter(type) {
		for (var key in this.gsTimers[type]) {
			var entry = this.gsTimers[type][key];
			if (entry.handle) {
				log.debug('suspending %s %s.%s', type, this, key);
				(type === 'timer' ? clearTimeout : clearInterval)(entry.handle);
				delete entry.handle;
			}
		}
	}, this);
};


/**
 * Resumes timers/intervals (should be called after loading the object
 * from persistence). Intervals are resumed in any case, whereas timers
 * are only resumed if their "firing time" is in the future (otherwise
 * the timer configuration is silently removed).
 */
GameObject.prototype.resumeGsTimers = function resumeGsTimers() {
	Object.keys(this.gsTimers).forEach(function iter(type) {
		for (var key in this.gsTimers[type]) {
			var entry = this.gsTimers[type][key];
			if (type === 'timer') {
				// remove timers that already are in the past
				entry.options.delay -= (new Date().getTime() - entry.start);
				if (entry.options.delay < 0) {
					log.debug('%s.%s past due, cleaning up', this, key);
					delete this.gsTimers[type][key];
					continue;
				}
			}
			log.debug('resuming %s %s.%s', type, this, key);
			this.setGsTimer(entry.options);
		}
	}, this);
};


/**
 * Cancels a scheduled timer call, resp. clears an interval call.
 *
 * @param {string} fname name of the method whose tiner/interval call
 *        should be canceled
 * @param {boolean} [interval] if `true`, cancels an interval call for
 *        the given function, otherwise a timer
 * @returns {boolean} `true` if a scheduled timer/interval was actually
 *          cancelled
 */
GameObject.prototype.cancelGsTimer = function cancelGsTimer(fname, interval) {
	var ret = false;
	var type = interval ? 'interval' : 'timer';
	var entry = this.gsTimers[type][fname];
	if (entry) {
		if (entry.handle) {
			(interval ? clearInterval : clearTimeout)(entry.handle);
			ret = true;
		}
		delete this.gsTimers[type][fname];
	}
	return ret;
};


/**
 * Checks if there are any pending timers calls/active interval calls
 * on this object.
 *
 * @returns {boolean} `true` if there are active timers/intervals
 */
GameObject.prototype.hasActiveGsTimers = function hasActiveGsTimers() {
	for (var type in this.gsTimers) {
		for (var key in this.gsTimers[type]) {
			if (this.gsTimers[type][key].handle) return true;
		}
	}
	return false;
};
