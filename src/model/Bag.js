'use strict';

module.exports = Bag;


var Item = require('model/Item');
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
 * Creates a processed shallow copy of this bag's data, prepared for
 * serialization.
 *
 * @see {@link GameObject#serialize|GameObject.serialize}
 */
Bag.prototype.serialize = function() {
	var ret = Bag.super_.prototype.serialize.call(this);
	ret.items = utils.hashToArray(ret.items);
	ret.hiddenItems = utils.hashToArray(ret.hiddenItems);
	return ret;
};
