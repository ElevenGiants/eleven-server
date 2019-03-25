'use strict';

module.exports = IdObjRefMap;


var _ = require('lodash');
var orProxy = require('data/objrefProxy');
var utils = require('utils');


/**
 * Container for a collection of {@link GameObject}s (stored as
 * properties with their TSIDs as names), providing a `length`
 * property and an iterator helper function.
 *
 * @param {array} [data] optional initial content (array elements are
 *        shallow-copied into the map; objref descriptors are copied
 *        without loading the referenced objects)
 * @constructor
 */
function IdObjRefMap(data) {
	if (data && !_.isArray(data)) {
		throw new TypeError('invalid data type for IdObjRefMap: ' + typeof data);
	}
	for (var i = 0; data && i < data.length; i++) {
		var obj = data[i];
		if (!_.isObject(obj)) {
			// ignore values that aren't objects
			continue;
		}
		if (obj.__isORP) {
			orProxy.setupObjRefProp(obj.tsid, this, obj.tsid);
		}
		else {
			// if the object is already loaded, we don't need the accessor
			// property (and this allows tests without persistence layer)
			this[obj.tsid] = obj;
		}
	}
}


/**
 * the number of stored objects
 *
 * @name length
 * @member {number}
 * @memberof IdObjRefMap
 * @instance
 */
Object.defineProperty(IdObjRefMap.prototype, 'length', {
	get: function get() {
		return Object.keys(this).length;
	},
});


/**
 * Iterates over objects in this map, optionally filtering by
 * `class_tsid`, and calls the given function on each one.
 *
 * @param {string} [classTsid] only iterate over objects of this class
 * @param {function} func function to be called for each (matching)
 *        object; signature: `func(obj)`
 */
IdObjRefMap.prototype.apiIterate = function apiIterate(classTsid, func) {
	// handle optional classTsid parameter
	if (_.isFunction(classTsid)) {
		func = classTsid;
		classTsid = undefined;
	}
	log.debug('IdObjRefMap.apiIterate(%s, %s)', classTsid, func.name);
	var keys = Object.keys(this);
	for (var i = 0; i < keys.length; i++) {
		var o = this[keys[i]];
		if (typeof o !== 'object') continue;
		if (!classTsid || o.class_tsid === classTsid) {
			func(o);
		}
	}
};
// hide function from for...in loops on IdObjRefMap instances:
utils.makeNonEnumerable(IdObjRefMap.prototype, 'apiIterate');
