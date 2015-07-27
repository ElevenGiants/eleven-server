'use strict';

module.exports = OrderedHash;


require('harmony-reflect');
var utils = require('utils');


/**
 * A class that provides sorted map functionality in JS. Entries are
 * sorted using natural order of keys.
 *
 * For the sake of simplicity, property keys are sorted on read access
 * (resp. on enumeration); this class is obviously **not** well suited
 * for big collections with few writes and many reads.
 *
 * @param {object} [data] optional initial content (properties are
 *        shallow-copied into the hash)
 * @constructor
 */
function OrderedHash(data) {
	// wrap the actual class in a proxy that makes sure for...in loops
	// loop over the properties in natural order of their keys
	return new Proxy(new OrderedHashAux(data), {
		enumerate: function enumerate(target) {
			var sortedKeys = target.sortedKeys();
			var l = sortedKeys.length;
			var i = 0;
			return {
				next: function next() {
					if (i === l) return {done: true};
					return {
						done: false,
						value: sortedKeys[i++],
					};
				},
			};
		},
		ownKeys: function ownKeys(target) {
			return target.sortedKeys();
		},
		get: function get(target, name, receiver) {
			if (name === 'toJSON') {
				// required to prevent weird context-less "illegal access"
				// errors when stringifying proxied objects (or objects with
				// proxied children)
				// see: https://github.com/tvcutsem/harmony-reflect/issues/38
				return function toJSON() {
					return target;
				};
			}
			return target[name];
		},
	});
}


function OrderedHashAux(data) {
	utils.copyProps(data, this);
}


/**
 * Helper function for {@link OrderedHashAux#first|first} and {@link
 * OrderedHashAux#last|last}.
 * @private
 */
OrderedHashAux.prototype.sortedKeys = function sortedKeys() {
	return Object.keys(this).sort();
};
utils.makeNonEnumerable(OrderedHashAux.prototype, 'sortedKeys');


/**
 * Retrieves the hash entry whose key is first (according to natural
 * order).
 *
 * @returns {*} first value in the hash
 */
OrderedHashAux.prototype.first = function first() {
	return this[this.sortedKeys()[0]];
};
utils.makeNonEnumerable(OrderedHashAux.prototype, 'first');


/**
 * Retrieves the hash entry whose key is last (according to natural
 * order).
 *
 * @returns {*} last value in the hash
 */
OrderedHashAux.prototype.last = function last() {
	return this[this.sortedKeys().slice(-1)];
};
utils.makeNonEnumerable(OrderedHashAux.prototype, 'last');


/**
 * Returns the length of the hash.
 *
 * @returns {number} number of key/value pairs stored in the hash
 */
OrderedHashAux.prototype.length = function length() {
	return Object.keys(this).length;
};
utils.makeNonEnumerable(OrderedHashAux.prototype, 'length');


/**
 * Clears the hash by removing all non-function direct properties.
 */
OrderedHashAux.prototype.clear = function clear() {
	for (var prop in this) {
		if (this.hasOwnProperty(prop) && typeof this[prop] !== 'function') {
			delete this[prop];
		}
	}
};
utils.makeNonEnumerable(OrderedHashAux.prototype, 'clear');
