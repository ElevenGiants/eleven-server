'use strict';

/**
 * Model layer API functions for the {@link Bag} class (used by GSJS
 * code). These functions are attached to `Bag.prototype` at server
 * startup.
 *
 * @mixin
 */
var BagApi = module.exports = function BagApi() {};


/**
 * Returns a hash containing all items in this bag (recursively, i.e.
 * descending into bags inside it), with keys representing the path
 * to the respective item.
 *
 * @returns {object} a hash with all contained items
 */
BagApi.prototype.apiGetAllItems = function apiGetAllItems() {
	log.trace('%s.apiGetAllItems()', this);
	return this.getAllItems();
};


/**
 * Gets a list of items of a particular type from this bag's contents.
 *
 * @param {string} classTsid class ID of the items to return
 * @param {number} [minCount] when given, only items with a combined stack size
 *        of at least this number are returned (i.e. not necessarily all
 *        available items)
 * @returns {object} a hash with the matching items
 */
BagApi.prototype.apiBagGetItems = function apiBagGetItems(classTsid, minCount) {
	log.debug('%s.apiBagGetItems(%s, %s)', this, classTsid, minCount);
	return this.getClassItems(classTsid, minCount > 0 ? minCount : undefined);
};


/**
 * Add an item to the bag's hidden items list, making it "invisible"
 * for other API functions working on the bag contents. It can still be
 * accessed through the `hiddenItems` property.
 *
 * @param {Item} item the item to add
 */
BagApi.prototype.apiAddHiddenStack = function apiAddHiddenStack(item) {
	log.debug('%s.apiAddHiddenStack(%s)', this, item);
	item.setContainer(this, undefined, undefined, true);
};


/**
 * Retrieves a list of items in the bag, i.e. an array with {@link
 * Item} instances and `null` for empty slots.
 *
 * @param {number} [count] length of the inventory to retrieve
 *        (defaults to the bag capacity)
 * @returns {array} a list of items corresponding to the bag contents
 */
BagApi.prototype.apiGetSlots = function apiGetSlots(count) {
	log.trace('%s.apiGetSlots(%s)', this, count);
	return this.getSlots(count);
};
