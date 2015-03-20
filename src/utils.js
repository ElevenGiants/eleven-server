'use strict';

/**
 * Various helper functions.
 *
 * @module
 */

// public interface
module.exports = {
	makeTsid: makeTsid,
	checkUniqueHashes: checkUniqueHashes,
	copyProps: copyProps,
	isInt: isInt,
	intVal: intVal,
	isGameObject: isGameObject,
	isBag: isBag,
	isPlayer: isPlayer,
	isLoc: isLoc,
	isGeo: isGeo,
	isItem: isItem,
	isDC: isDC,
	isQuest: isQuest,
	isGroup: isGroup,
	makeNonEnumerable: makeNonEnumerable,
	addNonEnumerable: addNonEnumerable,
	arrayToHash: arrayToHash,
	hashToArray: hashToArray,
	shallowCopy: shallowCopy,
	padLeft: padLeft,
	gameObjArgToList: gameObjArgToList,
	playersArgToList: playersArgToList,
	pointOnPlat: pointOnPlat,
	prepConnect: prepConnect
};


var assert = require('assert');
var util = require('util');
var murmur = require('murmurhash-js');


// buffer variables for TSID generation
var lastTsidTime = 0;
var lastTsidHrt = process.hrtime();


/**
 * Creates a unique ID for a game object, based on server ID and
 * current time.
 *
 * @param {string} initial first letter of the returned TSID,
 *        corresponding to the game object type
 * @param {string} gsid unique ID of the game server creating the
 *        object
 * @returns {string} the generated TSID
 */
function makeTsid(initial, gsid) {
	assert(typeof initial === 'string', util.format(
		'TSID initial must be a string (got: %s)', typeof initial));
	assert(initial.length === 1, util.format(
		'TSID initial must be single letter (got length: %s)', initial.length));
	assert(typeof gsid === 'string' && gsid.length >= 1, util.format(
		'GSID must be a non-empty string (got: %s)', gsid));
	var t = new Date().getTime() * 1e6;  // epoch time in ns
	while (t <= lastTsidTime) {
		// add ns since previous TSID was generated (repeatedly if timer
		// resolution is too low)
		t += process.hrtime(lastTsidHrt)[1];
	}
	lastTsidTime = t;
	lastTsidHrt = process.hrtime();
	var code = murmur.murmur3(gsid).toString(36) + t.toString(36);
	return (initial + code).toUpperCase();
}


/**
 * Makes sure that the hash function used for TSID generation does not
 * generate colliding hashes for the given list of strings (e.g. game
 * server IDs).
 *
 * @param {string[]} ids the list of strings to check
 * @throws {AssertionError} in case of a hash collision between two
 *         of the given strings
 */
function checkUniqueHashes(ids) {
	var hashes = {};
	for (var i = 0; i < ids.length; i++) {
		var id = ids[i];
		var hash = murmur.murmur3(id);
		for (var k in hashes) {
			assert(hash !== hashes[k], util.format(
				'hash collision for %s and %s (%s)', id, k, hash));
		}
		hashes[id] = hash;
	}
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
 * Checks whether the supplied value is an integer number (works for
 * number and string type values).
 *
 * @param {number|string} i
 * @returns {boolean}
 */
function isInt(i) {
	return i !== null && i !== '' && typeof i !== 'boolean' && i % 1 === 0;
}


/**
 * Converts a string containing a numeric value to the actual
 * corresponding number (radix 10).
 *
 * @param {string|number} i the string to convert (finite numbers are
 *        also accepted and just passed through)
 * @returns {number} the parsed numeric value
 * @throws {AssertionError} in case the given string cannot be parsed
 *         to a finite integer value
 */
function intVal(i) {
	var ret = parseInt(i, 10);
	assert(!isNaN(ret) && isFinite(ret), 'invalid numeric value: ' + i);
	return ret;
}


/**
 * Checks whether a given object or TSID is (resp. refers to, in case
 * of proxies) a {@link GameObject}.
 *
 * @param {GameObject|string} gameObjOrTsid game object/TSID to check
 * @returns {boolean}
 */
function isGameObject(gameObjOrTsid) {
	var i = getInitial(gameObjOrTsid);
	return i === 'I' || i === 'B' || i === 'G' || i === 'L' || i === 'P' ||
		i === 'R' || i === 'D' || i === 'Q';
}


/**
 * Checks whether a given game object or TSID is (resp. refers to) a
 * {@link Bag} (which includes {@link Player}s).
 *
 * @param {GameObject|string} gameObjOrTsid game object/TSID to check
 * @returns {boolean}
 */
function isBag(gameObjOrTsid) {
	var i = getInitial(gameObjOrTsid);
	return i === 'P' || i === 'B';
}


/**
 * Checks whether a given game object or TSID is (resp. refers to) a
 * {@link Player}.
 *
 * @param {GameObject|string} gameObjOrTsid game object/TSID to check
 * @returns {boolean}
 */
function isPlayer(gameObjOrTsid) {
	return getInitial(gameObjOrTsid) === 'P';
}


/**
 * Checks whether a given game object or TSID is (resp. refers to) a
 * {@link Location}.
 *
 * @param {GameObject|string} gameObjOrTsid game object/TSID to check
 * @returns {boolean}
 */
function isLoc(gameObjOrTsid) {
	return getInitial(gameObjOrTsid) === 'L';
}


/**
 * Checks whether a given game object or TSID is (resp. refers to) a
 * geometry object.
 *
 * @param {GameObject|string} gameObjOrTsid game object/TSID to check
 * @returns {boolean}
 */
function isGeo(gameObjOrTsid) {
	return getInitial(gameObjOrTsid) === 'G';
}


/**
 * Checks whether a given game object or TSID is (resp. refers to) an
 * {@link Item} (which includes {@link Player}s and {@link Bag}s).
 *
 * @param {GameObject|string} gameObjOrTsid game object/TSID to check
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
 * @param {GameObject|string} gameObjOrTsid game object/TSID to check
 * @returns {boolean}
 */
function isDC(gameObjOrTsid) {
	return getInitial(gameObjOrTsid) === 'D';
}


/**
 * Checks whether a given game object or TSID is (resp. refers to) a
 * {@link Quest}.
 *
 * @param {GameObject|string} gameObjOrTsid game object/TSID to check
 * @returns {boolean}
 */
function isQuest(gameObjOrTsid) {
	return getInitial(gameObjOrTsid) === 'Q';
}


/**
 * Checks whether a given game object or TSID is (resp. refers to) a
 * {@link Group}.
 *
 * @param {GameObject|string} gameObjOrTsid game object/TSID to check
 * @returns {boolean}
 */
function isGroup(gameObjOrTsid) {
	return getInitial(gameObjOrTsid) === 'R';
}


/**
 * Retrieves the first character of a given game object or TSID.
 *
 * @param {GameObject|string} gameObjOrTsid game object or TSID to
 *        examine
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
 * Makes an existing property of an object non-enumerable (e.g. to
 * exclude it from AMF serialization).
 *
 * @param {object} obj object to modify
 * @param {string} propName name of the property to make non-enumerable
 */
function makeNonEnumerable(obj, propName) {
	addNonEnumerable(obj, propName, obj[propName]);
}


/**
 * Adds a new non-enumerable, writable property to an object.
 *
 * @param {object} obj object to add the property to
 * @param {string} propName name of the new property
 * @param {*} [val] value of the new property
 */
function addNonEnumerable(obj, propName, val) {
	Object.defineProperty(obj, propName, {
		value: val,
		configurable: true,
		enumerable: false,
		writable: true,
	});
}


/**
 * Copies game objects from an array into a hash (object with game
 * objects as properties, and their respective TSIDs as keys).
 *
 * @param {GameObject[]} data the game object array to convert
 * @returns {object} hash with game object properties
 * @throws {Error} when an object in `data` does not have a valid TSID
 */
function arrayToHash(data) {
	var ret = {};
	if (data instanceof Array) {
		for (var i = 0; i < data.length; i++) {
			if (typeof data[i].tsid !== 'string') {
				throw new Error('invalid TSID: ' + data[i].tsid);
			}
			ret[data[i].tsid] = data[i];
		}
	}
	return ret;
}


/**
 * Copies game objects from a hash into an array.
 *
 * @param {object} data hash with game object properties
 * @returns {GameObject[]} array containing the game objects from
 *          `data`
 */
function hashToArray(data) {
	var ret = [];
	for (var key in data) {
		if (data.hasOwnProperty(key)) {
			ret.push(data[key]);
		}
	}
	return ret;
}


/**
 * Creates a shallow copy of a given object, containing only direct
 * ("own"), non-function-type properties.
 *
 * @param {object|undefined} obj input data
 * @returns {object|undefined} shallow copy of `obj`, or `undefined` if
 *          input was `undefined`
 */
function shallowCopy(obj) {
	if (obj === undefined) return undefined;
	assert(typeof obj === 'object' && obj !== null && !(obj instanceof Array),
		'invalid type: ' + typeof obj);
	var ret = {};
	for (var k in obj) {
		if (obj.hasOwnProperty(k) && typeof obj[k] !== 'function') {
			ret[k] = obj[k];
		}
	}
	return ret;
}


/**
 * Pads a string to the left with a given character up to the desired
 * length.
 *
 * @param {string} str string to left-pad
 * @param {string} pad padding character (must be a single character)
 * @param {number} len desired overall length (string + padding); if
 *        `str` is already this long or longer, nothing happens
 * @returns {string} the padded string
 */
function padLeft(str, pad, len) {
	var ret = str.toString();
	while (ret.length < len) {
		ret = pad + ret;
	}
	return ret;
}


/**
 * Helper function for converting a list or hash of game objects to an
 * array of TSIDs.
 *
 * @param {object|array|string|GameObject} objects a hash (object with
 *        TSIDs as keys and `GameObject` instances as values), an array
 *        containing TSIDs or `GameObject` instances, a TSID string, or
 *        a single `GameObject` instance
 * @param {function} [filter] filter function to further specify the
 *        type of desired objects; if not specified, any `GameObject`
 *        is allowed
 * @returns {array} the resulting array of TSID strings
 */
function gameObjArgToList(objects, filter) {
	filter = filter || isGameObject;
	var ret = [];
	// handle single GameObject instance or single TSID string as 1-element array
	if (filter(objects)) objects = [objects];
	// if it's an object, assume it's a hash with TSIDs as keys
	if (objects && typeof objects === 'object' && !(objects instanceof Array)) {
		objects = Object.keys(objects);
	}
	if (objects instanceof Array) {
		// could be an array of TSIDs or an array of GameObject instances
		for (var i = 0; i < objects.length; i++) {
			var o = objects[i];
			if (filter(o)) {
				ret.push(typeof o === 'string' ? o : o.tsid);
			}
		}
	}
	return ret;
}


/**
 * Helper function for converting a loosely typed player list argument
 * (as used by several model API functions) to an array of TSIDs.
 *
 * @param {object|array|string|Player} players may be either a hash
 *        (object with TSIDs as keys and `Player` instances as values),
 *        an array containing TSIDs or `Player`s, a player TSID string,
 *        or a single `Player` instance
 * @returns {array} an array of player TSID strings
 */
function playersArgToList(players) {
	return gameObjArgToList(players, isPlayer);
}


/**
 * Finds the point on a platform given a known x value.
 * Does **not** consider platform permeability.
 *
 * @param {object} plat platform data
 * @param {number} x x location on the platform
 * @returns {object} the x/y coordinates of the point on the platform,
 *          or `undefined` if the x value is not on the platform
 */
function pointOnPlat(plat, x) {
	var ret;
	if (plat.start.x <= x && plat.end.x >= x) {
		var fraction = (x - plat.start.x) / (plat.end.x - plat.start.x);
		var y = plat.start.y + fraction * (plat.end.y - plat.start.y);
		ret = {x: x, y: Math.floor(y)};
	}
	return ret;
}

function prepConnect(conn) {
	var ret = shallowCopy(conn);
	if (conn.target) {
		ret.target = conn.target;  // may be non-enumerable (when prepConnect used more than once)
		ret.label = conn.target.label;
		ret.street_tsid = conn.target.tsid;
	}
	// client does not need/want target, only GSJS:
	makeNonEnumerable(ret, 'target');
	return ret;
}
