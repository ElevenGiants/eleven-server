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
 * @mixes BagApi
 */
function Bag(data) {
	Bag.super_.call(this, data);
	if (!('capacity' in this)) this.capacity = 16;
	if (!this.items) this.items = {};
	if (this.items instanceof Array) {
		this.items = utils.arrayToHash(this.items);
	}
	if (!this.hiddenItems) this.hiddenItems = {};
	if (this.hiddenItems instanceof Array) {
		this.hiddenItems = utils.arrayToHash(this.hiddenItems);
	}
	this.patchFuncStatsUpdate('onInputBoxResponse');
}

utils.copyProps(require('model/BagApi').prototype, Bag.prototype);


/**
 * Creates a new `Bag` instance and adds it to persistence.
 *
 * @param {string} classTsid specific class of the bag
 * @returns {object} a new `Bag` object
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
 * Assigns the bag to a container. This overrides {@link
 * Item#setContainer} to recursively perform the operation on the
 * objects contained in the bag.
 *
 * @param {Location|Player|Bag} cont new container for the bag
 * @param {number} x x coordinate in the new location, or slot number
 *        if the container is a player or bag (irrelevant when adding
 *        as hidden item)
 * @param {number} y y coordinate in the new location (irrelevant when
 *        adding to player/bag)
 * @param {boolean} [hidden] item will be hidden in the new container
 *        (`false` by default)
 */
Bag.prototype.setContainer = function setContainer(cont, x, y, hidden) {
	var ptcont = this.tcont;  // previous top container
	Bag.super_.prototype.setContainer.call(this, cont, x, y, hidden);
	if (this.tcont !== ptcont) {
		for (var k in this.items) {
			var it = this.items[k];
			it.setContainer(this, it.x, it.y, it.isHidden);
		}
	}
};


/**
 * Overrides {@link Item#getChangeData} to add bag-specific extra
 * properties.
 *
 * @param {Player} pc player whose client this data will be sent to
 *        (required because some of the fields are "personalized")
 * @param {boolean} [removed] if `true`, this record will mark the
 *        item as deleted (used when items change containers, in which
 *        case they are marked deleted in the changes for the previous
 *        container)
 * @returns {object} changes data set
 */
Bag.prototype.getChangeData = function getChangeData(pc, removed) {
	var ret = Bag.super_.prototype.getChangeData.call(this, pc, removed);
	if (this.hasTag && !this.hasTag('not_openable')) ret.slots = this.capacity;
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
 * @param {boolean} [includeHidden] if `true`, includes hidden items
 * @param {boolean} [sort] sort items by slot number (`true` by default)
 * @param {object} [aggregate] for internal use (recursion)
 * @param {object} [pathPrefix] for internal use (recursion)
 * @returns {object} a hash with all contained items, as decribed above
 *          (NB: does not contain the root bag itself!)
 */
Bag.prototype.getAllItems = function getAllItems(includeHidden, sort, aggregate,
	pathPrefix) {
	if (sort === undefined) sort = true;
	var ret = aggregate || {};
	var lookIn = [this.items];
	if (includeHidden) {
		lookIn.push(this.hiddenItems);
	}
	pathPrefix = pathPrefix || '';
	lookIn.forEach(function collect(itemHash) {
		var keys = Object.keys(itemHash);
		if (sort) keys.sort(function sort(a, b) {
			return itemHash[a].x - itemHash[b].x;
		});
		for (var i = 0; i < keys.length; i++) {
			var it = itemHash[keys[i]];
			ret[pathPrefix + it.tsid] = it;
			if (utils.isBag(it)) {
				it.getAllItems(includeHidden, sort, ret, pathPrefix + it.tsid + '/');
			}
		}
	});
	return ret;
};


/**
 * Gets a list of (non-hidden) items of a particular type from this
 * bag's direct content (i.e. not recursively).
 *
 * @param {string} classTsid item class ID to filter for
 * @param {number} [max] combined stack size limit
 * @returns {object} found matching items (with TSIDs as keys)
 */
Bag.prototype.getClassItems = function getClassItems(classTsid, max) {
	var ret = {};
	var count = 0;
	for (var k in this.items) {
		if (max && count >= max) break;
		var it = this.items[k];
		if (it.class_tsid === classTsid) {
			ret[k] = it;
			count += it.count;
		}
	}
	return ret;
};


/**
 * Retrieves the item at a given slot position.
 *
 * @param {number} slot bag slot index
 * @returns {Item|null} item in the given slot, or `null` if that slot
 *          is empty
 */
Bag.prototype.getSlot = function getSlot(slot) {
	slot = utils.intVal(slot);
	for (var k in this.items) {
		if (this.items[k].x === slot) {
			return this.items[k];
		}
	}
	return null;
};


/**
 * Retrieves an item specified by slot number or path.
 *
 * @param {number|string} slotOrPath a bag slot number or a path string
 *        (like "BAGID1/ITEMID2") pointing to an item in this bag
 * @returns {Item|null} the requested item, or `null` if not found
 */
Bag.prototype.getSlotOrPath = function getSlotOrPath(slotOrPath) {
	var ret = null;
	if (slotOrPath !== undefined && slotOrPath !== null) {
		if (utils.isInt(slotOrPath)) {
			ret = this.getSlot(slotOrPath) || null;
		}
		else {
			ret = this.getAllItems(true)[slotOrPath] || null;
		}
	}
	return ret;
};


/**
 * Retrieves a representation of the (non-hidden) bag inventory, i.e.
 * an array with {@link Item} instances at positions corresponding to
 * their respective bag slot index. Empty slots translate to `null`
 * values in the returned array.
 *
 * @param {number} [count] length of the inventory to retrieve
 *        (defaults to `this.capacity`)
 * @returns {array} a list of items corresponding to the bag contents
 */
Bag.prototype.getSlots = function getSlots(count) {
	if (!count) count = this.capacity;
	var ret = [];
	for (var i = 0; i < count; i++) {
		ret[i] = null;
	}
	for (var k in this.items) {
		var it = this.items[k];
		if (it.x < count) ret[it.x] = it;
	}
	return ret;
};


/**
 * Transfers (part of) an item stack to the given bag slot, if possible
 * (merging with an existing stack if necessary).
 *
 * @param {Item} item the item to transfer/merge
 * @param {number} slot target bag slot index
 * @param {number} [amount] amount to transfer; if `undefined`, try to
 *        add the whole item stack
 * @returns {number} actual amount transferred
 */
Bag.prototype.addToSlot = function addToSlot(item, slot, amount) {
	if (amount === undefined) {
		amount = item.count;
	}
	// if the stack is bigger than allowed, don't perpetuate the error
	amount = Math.min(amount, item.stackmax || 1);
	// if there already is an item in that slot, try to merge
	var slotItem = this.getSlot(slot);
	if (slotItem) {
		return slotItem.merge(item, amount);
	}
	// otherwise, add the item to that slot (splitting it if appropriate)
	if (amount < item.count) {
		item = item.split(amount);
		if (!item) return 0;  // if split failed for some reason
	}
	item.setContainer(this, slot);
	return item.count;
};
