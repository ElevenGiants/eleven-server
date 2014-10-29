'use strict';

module.exports = Bag;


var assert = require('assert');
var Item = require('model/Item');
var pers = require('data/pers');
var util = require('util');
var utils = require('utils');


util.inherits(Bag, Item);
Bag.prototype.TSID_INITIAL = 'B';


/**
 * Generic constructor for both instantiating an existing bag (from
 * JSON data), and creating a new bag.
 *
 * @param {object} [data] initialization values (properties are
 *        shallow-copied into the bag)
 * @constructor
 * @augments Item
 */
function Bag(data) {
	Bag.super_.call(this, data);
	if (!this.items) this.items = {};
	if (this.items instanceof Array) {
		this.items = utils.arrayToHash(this.items);
	}
	for (var key in this.items) {
		this.items[key].slot = this.items[key].x;
	}
	if (!this.hiddenItems) this.hiddenItems = {};
	if (this.hiddenItems instanceof Array) {
		this.hiddenItems = utils.arrayToHash(this.hiddenItems);
	}
}


/**
 * Creates a new `Bag` instance and adds it to persistence.
 *
 * @param {string} classTsid specific class of the item
 * @returns {object} a `Bag` instance wrapped in a {@link
 * module:data/persProxy|persistence proxy}
 */
Bag.create = function create(classTsid) {
	assert(classTsid.substr(0, 4) === 'bag_', util.format(
		'invalid class TSID for Bag: %s', classTsid));
	return pers.create(Bag, {class_tsid: classTsid});
};


/**
 * Schedules this bag and all contained items for deletion after the
 * current request.
 */
Bag.prototype.del = function del() {
	[this.items, this.hiddenItems].forEach(function iter(itemHash) {
		for (var k in itemHash) {
			itemHash[k].del();
		}
	});
	Bag.super_.prototype.del.call(this);
};


/**
 * Creates a processed shallow copy of this bag's data, prepared for
 * serialization.
 *
 * @see {@link GameObject#serialize|GameObject.serialize}
 */
Bag.prototype.serialize = function serialize() {
	var ret = Bag.super_.prototype.serialize.call(this);
	ret.items = utils.hashToArray(ret.items);
	ret.hiddenItems = utils.hashToArray(ret.hiddenItems);
	return ret;
};


/**
 * Recursively collects the contents of this bag and all bags within
 * it, adding them to a flat data structure with TSID "paths" as keys,
 * like this:
 * ```
 * {
 *     "ITEMID1": item1,
 *     "BAGID1": bag1,
 *     "BAGID1/ITEMID2": item2,
 *     "BAGID1/BAGID2": bag2,
 *     "BAGID1/BAGID2/ITEMID3": item3
 * }
 * ```
 *
 * @param {object} [aggregate] for internal use (recursion)
 * @param {object} [pathPrefix] for internal use (recursion)
 * @returns {object} a hash with all contained items, as decribed above
 *          (NB: does not contain the root bag itself!)
 */
Bag.prototype.getAllItems = function getAllItems(aggregate, pathPrefix) {
	var ret = aggregate || {};
	pathPrefix = pathPrefix || '';
	[this.items, this.hiddenItems].forEach(function collect(itemHash) {
		for (var k in itemHash) {
			var it = itemHash[k];
			ret[pathPrefix + it.tsid] = it;
			if (utils.isBag(it)) {
				it.getAllItems(ret, pathPrefix + it.tsid + '/');
			}
		}
	});
	return ret;
};
