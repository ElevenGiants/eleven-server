module.exports = IdObjRefMap;


var utils = require('utils');


/**
 * Container for a collection of {@link GameObject}s (stored as
 * properties with their TSIDs as names), providing a `length`
 * property and an iterator helper function.
 *
 * @param {object} [data] optional initial content (properties are
 *        shallow-copied into the map)
 * @constructor
 */
function IdObjRefMap(data) {
	utils.copyProps(data, this);
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
	get: function() {
		return Object.keys(this).length;
	},
});


/**
 * Iterates over objects in this map, optionally filtering by
 * `class_tsid`, and calls the given function on each one.
 *
 * @param {string} [class_tsid] only iterate over objects of this class
 * @param {function} func function to be called for each (matching)
 *        object; signature: `func(obj)`
 */
IdObjRefMap.prototype.apiIterate = function(class_tsid, func) {
	// handle optional class_tsid parameter
	if (class_tsid instanceof Function) {
		func = class_tsid;
		class_tsid = undefined;
	}
	log.debug('IdObjRefMap.apiIterate(%s, %s)', class_tsid, func.name);
	var keys = Object.keys(this);
	for (var i = 0; i < keys.length; i++) {
		var o = this[keys[i]];
		if (typeof o !== 'object') continue;
		if (!class_tsid || o.class_tsid === class_tsid) {
			func(o);
		}
	}
};
utils.makeNonEnumerable(IdObjRefMap.prototype, 'apiIterate');
