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
	utils.addNonEnumerable(this, 'deleted', false);  // see apiDelete/apiIsDeleted functions
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
