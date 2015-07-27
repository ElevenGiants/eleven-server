'use strict';

module.exports = GameObject;


var assert = require('assert');
var config = require('config');
var errors = require('errors');
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
	utils.addNonEnumerable(this, 'stale', false);
	// copy supplied data
	var key;
	for (key in data) {
		this[key] = data[key];
	}
	if (!this.ts) {
		this.ts = new Date().getTime();
	}
	if (!this.gsTimers) this.gsTimers = {};
	utils.makeNonEnumerable(this, 'gsTimers');
}

utils.copyProps(require('model/GameObjectApi').prototype, GameObject.prototype);


/**
 * Called by the persistence layer when the object is loaded, right
 * after construction and proxification.
 * **Caution**: Operations in this function (including anything added
 * by subclasses) must not allow yielding before the object is fully
 * loaded, initialized and "ready to use".
 */
GameObject.prototype.gsOnLoad = function gsOnLoad() {
	if (this.onLoad) {
		this.onLoad();
	}
	this.resumeGsTimers();
};


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
	for (var key in this.gsTimers) {
		var entry = this.gsTimers[key];
		if (entry.options.internal) continue;  // internal timers are not persisted
		if (!timers) timers = {};
		timers[key] = utils.shallowCopy(entry);
		delete timers[key].handle;  // no point persisting the handles
	}
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
	var rc = RC.getContext(true);
	if (rc) rc.setUnload(this);
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
 * @param {boolean} [options.noCatchUp] if `true`, missed calls are not
 *        executed upon interval resumption (`false` by default; only
 *        relevant for intervals)
 */
GameObject.prototype.setGsTimer = function setGsTimer(options) {
	log.trace('%s.setGsTimer(%s)', this, util.inspect(options, {depth: 1}));
	var logtag = util.format('%s.%s', this, options.fname);
	assert(!(options.multi && options.interval), 'multi intervals not supported');
	assert(typeof this[options.fname] === 'function', 'no such function: ' + logtag);
	if (!options.multi && this.gsTimerExists(options.fname, options.interval, true)) {
		log.trace('timer/interval already set: %s', logtag);
		return;
	}
	// create key to store timer information with (unique for multi timers)
	var key = options.fname;
	if (options.multi) {
		do {
			key = options.fname + '_' + new Date().getTime();
		}
		while (key in this.gsTimers);
	}
	// schedule timer in a separate request context
	var handle = this.scheduleTimer(options, key, this);
	// store data for API functions and saving/restoring timers to/from persistence
	this.gsTimers[key] = {
		handle: handle,
		start: new Date().getTime(),
		options: options,
	};
	// make sure update timer setup is persisted (gsTimers is non-enumerable)
	RC.setDirty(this);
};


/**
 * Helper function for {@link GameObject#setGsTimer|setGsTimer}.
 * Actually schedules the (timer driven) function call, wrapped in a
 * separate {@link RequestContext}.
 *
 * @param {object} options timer call options (see {@link
 *        GameObject#setGsTimer|setGsTimer} for details)
 * @param {string} key unique key for storing/persisting the timer data
 * @private
 */
GameObject.prototype.scheduleTimer = function scheduleTimer(options, key) {
	var self = this;
	if (options.delay > 2147483647) {
		// see https://github.com/joyent/node/issues/3605
		log.error(new errors.DummyError(), 'timer/interval delay too long: %s',
			options.delay);
		options.delay = 2147483647;
	}
	var handle = setTimeout(
		function execTimer() {
			var rc = new RC(options.fname, self);
			rc.run(
				function timerCall() {
					log.trace({options: options}, 'timer call');
					if (self.stale) {
						throw new Error('stale object');
					}
					if (!options.interval) {
						delete self.gsTimers[key];
					}
					try {
						self.gsTimerExec(options);
					}
					catch (e) {
						delete self.gsTimers[key];  // clean up
						log.error(e, 'error calling %s.%s (interval: %s)', self,
							options.fname, !!options.interval);
						// don't rethrow - we want to make sure the offending
						// timer/interval is not called again upon unload/reload
						return;
					}
					// schedule next interval iteration (unless it was canceled)
					if (self.gsTimers[key] && options.interval) {
						delete self.gsTimers[key];
						self.setGsTimer(options);
					}
					// make sure update timer setup is persisted
					rc.setDirty(self);
				},
				function callback(e) {
					if (e) {
						log.error(e, 'error calling %s.%s (interval: %s)', self,
							options.fname, !!options.interval);
					}
				}
			);
		}, options.delay
	);
	return handle;
};


/**
 * Actually performs a scheduled function call according to a
 * timer/interval options record.
 *
 * @param {object} options timer call options (see {@link
 *        GameObject#setGsTimer|setGsTimer} for details)
 * @private
 */
GameObject.prototype.gsTimerExec = function gsTimerExec(options) {
	this[options.fname].apply(this, options.args);
};


/**
 * Checks if a timer/interval is currently defined for a given method.
 *
 * @param {string} fname name of the method to check
 * @param {boolean} [interval] if `true`, checks if an interval call is
 *        defined for the given function (otherwise checks for a timer)
 * @param {boolean} [active] if `true`, don't just check if the timer
 *        is configured, but also if it has actually been started
 * @returns {boolean} `true` if an interval/timer call is scheduled
 */
GameObject.prototype.gsTimerExists = function gsTimerExists(fname, interval, active) {
	var entry = this.gsTimers[fname];
	if (entry) {
		if (entry.options.interval && interval || !entry.options.interval && !interval) {
			return !active || ('handle' in entry);
		}
	}
	return false;
};


/**
 * Suspends all currently active timers/intervals on the object.
 * This must be called before unloading an object.
 */
GameObject.prototype.suspendGsTimers = function suspendGsTimers() {
	for (var key in this.gsTimers) {
		var entry = this.gsTimers[key];
		if (entry.handle) {
			log.debug('suspending %s.%s', this, key);
			clearTimeout(entry.handle);
			delete entry.handle;
		}
	}
};


/**
 * Resumes timers/intervals, catching up on missed calls (should be
 * called after loading the object from persistence).
 */
GameObject.prototype.resumeGsTimers = function resumeGsTimers() {
	var now = new Date().getTime();
	for (var key in this.gsTimers) {
		var entry = this.gsTimers[key];
		if (entry.handle) {
			// skip internal stuff that's already running (e.g. started in constructor)
			log.debug('%s.%s already running', this, key);
			continue;
		}
		log.debug('resuming %s.%s', this, key);
		var age = now - entry.start;
		if (!entry.options.interval) {
			// reschedule with adjusted delay
			entry.options.delay = Math.max(entry.options.delay - age, 1);
			this.setGsTimer(entry.options);
		}
		else {
			// perform catch-up calls
			var num = Math.floor(age / entry.options.delay);
			if (num > 0 && !entry.options.noCatchUp) {
				log.debug('interval catching up (%s call(s))', num);
				for (var i = 0; i < num && !this.deleted; i++) {
					this.gsTimerExec(entry.options, num);
				}
			}
			// if not deleted while catching up (e.g. trant death), actually resume interval
			if (!this.deleted) {
				// schedule next call with shortened interval
				var nextDelay = entry.options.delay - age % entry.options.delay;
				this.setGsTimer({
					fname: entry.options.fname,
					delay: nextDelay,
					args: entry.options.args,
					multi: true,
					internal: true,
				});
				// schedule postponed start of the regular interval, inception-style
				var intStartOpts = {
					fname: 'setGsTimer',
					delay: nextDelay,
					args: [entry.options],
					multi: true,
					internal: true,
				};
				this.setGsTimer(intStartOpts);
			}
		}
	}
};


/**
 * Cancels a scheduled timer call, resp. clears an interval call.
 *
 * @param {string} fname name of the method whose timer/interval call
 *        should be canceled
 * @param {boolean} [interval] if `true`, cancels an interval call for
 *        the given function, otherwise a timer
 * @returns {boolean} `true` if a scheduled timer/interval was actually
 *          canceled
 */
GameObject.prototype.cancelGsTimer = function cancelGsTimer(fname, interval) {
	var ret = false;
	var entry = this.gsTimers[fname];
	/*jshint -W018 */
	if (entry && !!entry.options.interval === !!interval) {
		/*jshint +W018 */
		if (entry.handle) {
			clearTimeout(entry.handle);
			ret = true;
		}
		delete this.gsTimers[fname];
		// make sure update timer setup is persisted (gsTimers is non-enumerable)
		RC.setDirty(this);
	}
	return ret;
};

/**
 * Copies an entire object minus the exceptions from the skipList
 *
 * @param {object} from : The object to copy into this object
 * @param {array} skipList : The list of top level properties not to copy
 */
GameObject.prototype.copyProps = function copyProps(from, skipList, count) {
	if(count == undefined)
		count = 0;
	count++;
	for (var key in from) {
		var value = from[key];
		// Skip functions, as they're defined in Server/GSJS code and not to be persisted
		if (typeof value === 'function') continue;
		// Skip instance specific properties
		if (!from.hasOwnProperty(key)) continue;
		// Skip items specified to skip
		if (skipList && skipList.indexOf(key) !== -1) continue;
		// Directly copy primitive types
		if (!(value instanceof Object)) {
			this[key] = value;
		}
		else {
			// Directly copy objref proxies without digging down
			if (value.__isORP) {
				console.log(key);
			}
			// Recurse down for complex objects/arrays
			else {
				this[key] = value instanceof Array ? [] : {};
				console.log(key + " " + count);
				// don't provide skiplist, only want to skip top level items
				GameObject.prototype.copyProps.call(this[key], value, count);
			}
		}
	}
};

/**
 * Checks if there are any pending timers calls/active interval calls
 * on this object.
 *
 * @returns {boolean} `true` if there are active timers/intervals
 */
GameObject.prototype.hasActiveGsTimers = function hasActiveGsTimers() {
	for (var key in this.gsTimers) {
		if (this.gsTimers[key].handle) return true;
	}
	return false;
};
