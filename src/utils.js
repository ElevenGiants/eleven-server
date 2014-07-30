/**
 * Various helper functions.
 *
 * @module
 */

// public interface
module.exports = {
	makeTsid: makeTsid,
	copyProps: copyProps,
	copyProtoProps: copyProtoProps,
	isInt: isInt,
};


var assert = require('assert');
var util = require('util');


// buffer variables for TSID generation
var lastTsidTime = 0;
var lastTsidHrt = process.hrtime();


/**
 * Creates a unique ID for a game object, based on server ID and
 * current time.
 *
 * @param {string} initial first letter of the returned TSID,
 *        corresponding to the game object type
 * @returns {string} the generated TSID
 */
function makeTsid(initial) {
	// TODO: include server ID
	assert(typeof initial === 'string', util.format(
		'TSID initial must be a string (got: %s)', typeof initial));
	assert(initial.length === 1, util.format(
		'TSID initial must be single letter (got length: %s)', initial.length));
	var t = new Date().getTime() * 1e6;  // epoch time in ns
	while (t <= lastTsidTime) {
		// add ns since previous TSID was generated (repeatedly if timer
		// resolution is too low)
		t += process.hrtime(lastTsidHrt)[1];
	}
	lastTsidTime = t;
	lastTsidHrt = process.hrtime();
	return (initial + t.toString(36)).toUpperCase();
}


/**
 * Shallow-copies properties from one object to another. Only "direct"
 * properties are copied (i.e. not properties inherited from ancestors
 * in the object's prototype chain).
 *
 * @param {object} from copy source
 * @param {object} to copy target
 */
function copyProps(from, to) {
	for (var key in from) {
		if (from.hasOwnProperty(key)) {
			to[key] = from[key];
		}
	}
}


/**
 * Shallow-copies properties from the prototype of one object to the
 * prototype of another.
 *
 * @param {object} from copy source
 * @param {object} to copy target
 */
function copyProtoProps(from, to) {
	copyProps(from.prototype, to.prototype);
}


/**
 * Checks whether the supplied value is an integer number (works for
 * number and string type values).
 *
 * @param {number|string}
 * @returns {boolean}
 */
function isInt(i) {
	return i !== null && i !== '' && typeof i !== 'boolean' && i % 1 === 0;
}
