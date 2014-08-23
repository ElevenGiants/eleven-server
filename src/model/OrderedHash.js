'use strict';

module.exports = OrderedHash;


var utils = require('utils');


/**
 * A class that provides sorted map functionality in JS. Entries are
 * sorted using natural order of keys.
 *
 * For the sake of simplicity, the special accessor functions {@link
 * OrderedHash#first|first} and {@link OrderedHash#last|last} depend on
 * sorting the key list **on each call**.
 * Hence, this class is obviously **not** suited for working with big
 * collections.
 *
 * @param {object} [data] optional initial content (properties are
 *        shallow-copied into the hash)
 * @constructor
 */
function OrderedHash(data) {
	utils.copyProps(data, this);
}


/**
 * Helper function for {@link OrderedHash#first|first} and {@link
 * OrderedHash#last|last}.
 * @private
 */
OrderedHash.prototype.sortedKeys = function() {
	return Object.keys(this).sort();
};


/**
 * Retrieves the hash entry whose key is first (according to natural
 * order).
 *
 * @returns {*} first value in the hash
 */
OrderedHash.prototype.first = function() {
	return this[this.sortedKeys()[0]];
};


/**
 * Retrieves the hash entry whose key is last (according to natural
 * order).
 *
 * @returns {*} last value in the hash
 */
OrderedHash.prototype.last = function() {
	return this[this.sortedKeys().slice(-1)];
};


/**
 * Returns the length of the hash.
 *
 * @returns {number} number of key/value pairs stored in the hash
 */
OrderedHash.prototype.length = function() {
	return Object.keys(this).length;
};


/**
 * Clears the hash by removing all non-function direct properties.
 */
OrderedHash.prototype.clear = function() {
	for (var prop in this) {
		if (this.hasOwnProperty(prop) && typeof this[prop] !== 'function') {
			delete this[prop];
		}
	}
};
