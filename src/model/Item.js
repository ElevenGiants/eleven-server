'use strict';

module.exports = Item;


var assert = require('assert');
var GameObject = require('model/GameObject');
var OrderedHash = require('model/OrderedHash');
var pers = require('data/pers');
var util = require('util');
var utils = require('utils');


util.inherits(Item, GameObject);
Item.prototype.TSID_INITIAL = 'I';


// define some derived properties (used by GSJS)
Object.defineProperty(Item.prototype, 'isHidden', {
	get: function get() {
		return !!this.is_hidden;
	},
});
Object.defineProperty(Item.prototype, 'isStack', {
	get: function get() {
		return this.stackmax > 1;
	},
});


/**
 * Generic constructor for both instantiating an existing item (from
 * JSON data), and creating a new item.
 *
 * @param {object} [data] initialization values (properties are
 *        shallow-copied into the item)
 * @constructor
 * @augments GameObject
 */
function Item(data) {
	Item.super_.call(this, data);
	if (this.x === undefined) this.x = 0;
	if (this.y === undefined) this.y = 0;
	if (!utils.isInt(this.count)) this.count = 1;
	// add some non-enumerable properties (used internally or by GSJS)
	utils.addNonEnumerable(this, 'collDet', false);
	utils.addNonEnumerable(this, 'slot', undefined);
	utils.addNonEnumerable(this, 'path', this.tsid);
	// enable collision detection if we have a handler function
	if (typeof this.onPlayerCollision === 'function') {
		this['!colliders'] = {};
		this.collDet = true;
	}
	if (this.message_queue) {
		this.message_queue = new OrderedHash(this.message_queue);
	}
	this.updatePath();
}


/**
 * Creates a new `Item` instance and adds it to persistence.
 *
 * @param {string} classTsid specific class of the item
 * @param {number} [count] item stack size (1 by default)
 * @returns {object} an `Item` instance wrapped in a {@link
 * module:data/persProxy|persistence proxy}
 */
Item.create = function create(classTsid, count) {
	assert(classTsid.substr(0, 4) !== 'bag_', util.format(
		'invalid class TSID for Item: %s', classTsid));
	var data = {class_tsid: classTsid};
	if (utils.isInt(count)) {
		data.count = count;
	}
	return pers.create(Item, data);
};


/**
 * Schedules this item for deletion after the current request.
 */
Item.prototype.del = function del() {
	Item.super_.prototype.del.call(this);
	if (this.container) {
		delete this.container.items[this.tsid];
		delete this.container.hiddenItems[this.tsid];
		delete this.container;
	}
};


/**
 * Updates the item's `path` property; needs to be called whenever the
 * item was moved between containers.
 */
Item.prototype.updatePath = function updatePath() {
	this.path = this.tsid;
	// climb container chain upwards if container is a bag
	var cont = this.container;
	while (utils.isBag(cont) && !utils.isPlayer(cont)) {
		this.path = cont.tsid + '/' + this.path;
		cont = cont.container;
	}
};


/**
 * Sets the coordinates within the `Item`'s current location.
 *
 * @param {number} x
 * @param {number} y
 */
Item.prototype.setXY = function setXY(x, y) {
	this.x = x;
	this.y = y;
};


/**
 * Assigns the item to a different container. Removes it from the
 * previous container's item list, adds it to the new one and
 * updates internal properties accordingly.
 *
 * @param {Location|Player|Bag} cont new container for the item
 * @param {boolean} [hidden] item will be hidden in the new container
 *        (`false` by default)
 */
Item.prototype.setContainer = function setContainer(cont, hidden) {
	assert(cont !== this.container, util.format(
		'%s is already contained in %s', this, cont));
	var prev = this.container;
	this.container = cont;
	if (prev) {
		delete prev.items[this.tsid];
		delete prev.hiddenItems[this.tsid];
	}
	if (hidden) {
		cont.hiddenItems[this.tsid] = this;
	}
	else {
		cont.items[this.tsid] = this;
	}
	this.is_hidden = !!hidden;
	this.tcont = cont.tcont ? cont.tcont : cont.tsid;
	this.updatePath();
};


/**
 * Splits off the given amount from the item into a separate new item.
 * Obviously only works for stackable items, and handles invalid
 * arguments gracefully by just not returning a new item (notably, if
 * the given amount equals or exceeds the available stack size).
 *
 * @param {number} n the amount to split off
 * @returns {Item} a new item with count `n`, or `undefined` if the
 *          desired split is not possible
 */
Item.prototype.split = function split(n) {
	if (n < 1 || !utils.isInt(n)) {
		log.warn('invalid split amount: %s', n);
		return;
	}
	if (n >= this.count) return;
	this.count -= n;
	var newItem = Item.create(this.class_tsid, n);
	if (this.is_soulbound_item) {
		newItem.is_soulbound_item = this.is_soulbound_item;
		newItem.soulbound_to = this.soulbound_to;
	}
	return newItem;
};


/**
 * Transfers the given amount from another item to this item; if this
 * reduces the other item's count to 0, it is scheduled for deletion.
 * Only works for stackable items, and handles invalid arguments
 * gracefully (not performing any merging) as far as possible.
 *
 * @param {Item} that item to merge *from*
 * @param {number} n amount to transfer
 * @returns {number} amount actually transferred (can be less than `n`
 *          due to maximum stack size constraint)
 */
Item.prototype.merge = function merge(that, n) {
	if (n < 1 || !utils.isInt(n)) {
		log.warn('invalid merge amount: %s', n);
		return 0;
	}
	n = Math.min(n, that.count);
	// if items are non-stackable or incompatible, just return zero
	if (!(this.stackmax > 1 && that.stackmax > 1)) return 0;
	if (this.class_tsid !== that.class_tsid) return 0;
	if (this.soulbound_to !== that.soulbound_to) return 0;
	var moved = Math.min(n, this.stackmax - this.count);
	that.count -= moved;
	this.count += moved;
	if (that.count <= 0) that.del();
	return moved;
};
