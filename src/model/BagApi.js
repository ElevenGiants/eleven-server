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

/**
 * Retrieves an array of tsid -> reference
 *
 * @param {string} [classTsid] the class_id of the items to grab
 * @param {number} [minCount] the minimum count to be retrieved
 * @returns {array} map of tsid-> reference to stacks; if count of
 *        items doesn't add up to minCount, or minCount is -1 or
 *        undefined, all stacks will be returned, otherwise, all
 *        stacks totaling up to >= minCount will be returned
 *        ex:
 * 	      {
 *          "IRO1279HCD6319C" : <IRO1279HCD6319C Cherry>,
 *          "IRO10296DD63I14" : <IRO10296DD63I14 Cherry>
 *        }
 */
BagApi.prototype.apiBagGetItems = function apiBagGetItems(classTsid, minCount) {
	log.debug('%s.apiBagGetItems(%s, %s)', this, classTsid, minCount);
	return this.getItems(classTsid, minCount);
};
