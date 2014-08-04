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
	isBag: isBag,
	isPlayer: isPlayer,
	isLoc: isLoc,
	isGeo: isGeo,
	isItem: isItem,
	isDC: isDC,
	isQuest: isQuest,
	isGroup: isGroup,
	makeNonEnumerable: makeNonEnumerable,
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


/**
 * Checks whether a given game object or TSID is (resp. refers to) a
 * {@link Bag} (which includes {@link Player}s).
 *
 * @param {GameObject|string} game object or TSID to check
 * @returns {boolean}
 */
function isBag(gameObjOrTsid) {
	var i = getInitial(gameObjOrTsid);
	return  i === 'P' || i === 'B';
}


/**
 * Checks whether a given game object or TSID is (resp. refers to) a
 * {@link Player}.
 *
 * @param {GameObject|string} game object or TSID to check
 * @returns {boolean}
 */
function isPlayer(gameObjOrTsid) {
	return getInitial(gameObjOrTsid) === 'P';
}


/**
 * Checks whether a given game object or TSID is (resp. refers to) a
 * {@link Location}.
 *
 * @param {GameObject|string} game object or TSID to check
 * @returns {boolean}
 */
function isLoc(gameObjOrTsid) {
	return getInitial(gameObjOrTsid) === 'L';
}


/**
 * Checks whether a given game object or TSID is (resp. refers to) a
 * geometry object.
 *
 * @param {GameObject|string} game object or TSID to check
 * @returns {boolean}
 */
function isGeo(gameObjOrTsid) {
	return getInitial(gameObjOrTsid) === 'G';
}


/**
 * Checks whether a given game object or TSID is (resp. refers to) an
 * {@link Item} (which includes {@link Player}s and {@link Bag}s).
 *
 * @param {GameObject|string} game object or TSID to check
 * @returns {boolean}
 */
function isItem(gameObjOrTsid) {
	var i = getInitial(gameObjOrTsid);
	return i === 'I' || i === 'B' || i === 'P';
}


/**
 * Checks whether a given game object or TSID is (resp. refers to) a
 * generic data container.
 *
 * @param {GameObject|string} game object or TSID to check
 * @returns {boolean}
 */
function isDC(gameObjOrTsid) {
	return getInitial(gameObjOrTsid) === 'D';
}


/**
 * Checks whether a given game object or TSID is (resp. refers to) a
 * {@link Quest}.
 *
 * @param {GameObject|string} game object or TSID to check
 * @returns {boolean}
 */
function isQuest(gameObjOrTsid) {
	return getInitial(gameObjOrTsid) === 'Q';
}


/**
 * Checks whether a given game object or TSID is (resp. refers to) a
 * {@link Group}.
 *
 * @param {GameObject|string} game object or TSID to check
 * @returns {boolean}
 */
function isGroup(gameObjOrTsid) {
	return getInitial(gameObjOrTsid) === 'R';
}


/**
 * Retrieves the first character of a given game object or TSID.
 *
 * @param {GameObject|string} game object or TSID to examine
 * @returns {string|undefined} a single-letter string, or `undefined`
 *          if the input was invalid
 */
function getInitial(gameObjOrTsid) {
	if (gameObjOrTsid) {
		if (typeof gameObjOrTsid === 'string') {
			return gameObjOrTsid[0];
		}
		if (typeof gameObjOrTsid.tsid === 'string') {
			return gameObjOrTsid.tsid[0];
		}
	}
	// otherwise undefined
}


/**
 * Makes a property of an object non-enumerable (e.g. to exclude it
 * from AMF serialization).
 *
 * @param {object} obj object to modify (can be a prototype object, too)
 * @param {string} propName name of the property to make non-enumerable
 */
function makeNonEnumerable(obj, propName) {
	Object.defineProperty(obj, propName, {
		value: obj[propName],
		enumerable: false,
	});
}
