'use strict';

module.exports = Property;


var _ = require('lodash');
var assert = require('assert');
var utils = require('utils');


/**
 * A class for integer properties of game objects that provides atomic
 * manipulations on their values.
 *
 * @param {string} label name of the property
 * @param {number|object} data either just a numeric initial value, or
 *        an object containing extended configuration like:
 *        ```{val: 3, bottom: -3, top: 8000}```
 * @constructor
 * @mixes PropertyApi
 */
function Property(label, data) {
	this.label = label;
	if (data === undefined) data = {};
	if (_.isNumber(data)) {
		this.value = Math.round(data);
	}
	else if (_.isObject(data)) {
		this.value = _.isNumber(data.value) ? Math.round(data.value) : 0;
	}
	else {
		this.value = 0;
	}
	this.setLimits(
		_.isNumber(data.bottom) ? data.bottom : this.value,
		_.isNumber(data.top) ? data.top : this.value);
	// add a flag that indicates whether an update for this property's value
	// needs to be sent to the client
	utils.addNonEnumerable(this, 'changed', false);
}

utils.copyProps(require('model/PropertyApi').prototype, Property.prototype);


/**
 * @returns {string} string representation of the property
 */
Property.prototype.toString = function toString() {
	return '[prop.' + this.label + ':' + this.value + ']';
};


/**
 * Creates a compact representation of this property for persistent
 * serialization. The result can be used to reconstruct an equivalent
 * property (except for the label, which is stored as the property
 * name in the parent object).
 *
 * @returns {object} representation of the property for persistence
 */
Property.prototype.serialize = function serialize() {
	return {
		value: this.value,
		bottom: this.bottom,
		top: this.top,
	};
};


/**
 * Sets new limits for values of the property. Limits are rounded
 * using `Math.round`.
 *
 * @param {number} bottom new bottom limit
 * @param {number} top new top limit
 */
Property.prototype.setLimits = function setLimits(bottom, top) {
	bottom = Math.round(bottom);
	top = Math.round(top);
	assert(top >= bottom, 'invalid limits: ' + bottom + '/' + top);
	this.bottom = bottom;
	this.top = top;
	// clamp value to new limits:
	this.value = Math.min(this.top, Math.max(this.bottom, this.value));
};


/**
 * Sets the value of the property. Values exceeding the current limits
 * are ignored (no `Error` thrown, value remains unchanged).
 *
 * @param {number} val new value (rounded using `Math.round`)
 */
Property.prototype.setVal = function setVal(val) {
	val = Math.round(val);
	if (val >= this.bottom && val <= this.top) {
		if (this.value !== val) {
			this.value = val;
			this.changed = true;
		}
	}
	else {
		log.error('invalid value for %s: %s', this, val);
	}
};


/**
 * Increments the value of the property by the given amount.
 *
 * @param {number} delta increment by this much (converted to integer
 *        using `Math.floor`)
 * @returns {number} actual delta (may be different from given delta
 *          due to limits)
 */
Property.prototype.inc = function inc(delta) {
	var d = Math.min(this.top - this.value, Math.floor(delta));
	if (d !== 0) {
		this.value += d;
		this.changed = true;
	}
	return d;
};


/**
 * Decrements the value of the property by the given amount.
 *
 * @param {number} delta decrement by this much (converted to integer
 *        using `Math.floor`)
 * @returns {number} actual delta (may be different from given delta
 *          due to limits)
 */
Property.prototype.dec = function dec(delta) {
	var d = Math.min(this.value - this.bottom, Math.floor(delta));
	if (d !== 0) {
		this.value -= d;
		this.changed = true;
	}
	return -d;
};


/**
 * Multiplies the value of the property with the given factor. The
 * result is rounded using `Math.round`.
 *
 * @param {number} factor multiplication factor
 * @returns {number} value delta
 */
Property.prototype.mult = function mult(factor) {
	var newval = Math.round(this.value * factor);
	newval = Math.max(Math.min(newval, this.top), this.bottom);
	var d = newval - this.value;
	if (d !== 0) {
		this.value = newval;
		this.changed = true;
	}
	return d;
};
