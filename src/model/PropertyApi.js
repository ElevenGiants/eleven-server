'use strict';


/**
 * Model layer API functions for the {@link Property} class (used by
 * GSJS code). These functions are attached to `Property.prototype` at
 * server startup.
 *
 * @mixin
 */
// eslint-disable-next-line lodash/prefer-noop
var PropertyApi = module.exports = function PropertyApi() {};



/**
 * Sets the value of the property.
 *
 * @param {number} val new value
 */
PropertyApi.prototype.apiSet = function apiSet(val) {
	log.debug('%s.apiSet(%s)', this, val);
	this.setVal(val);
};


/**
 * Sets new limits for values of the property.
 *
 * @param {number} lo new bottom limit
 * @param {number} hi new top limit
 */
PropertyApi.prototype.apiSetLimits = function apiSetLimits(lo, hi) {
	log.trace('%s.apiSetLimits(%s, %s)', this, lo, hi);
	this.setLimits(lo, hi);
};


/**
 * Increments the value of the property by the given amount.
 *
 * @param {number} delta increment by this much
 * @returns {number} actual delta (may be different from given delta
 *          due to limits)
 */
PropertyApi.prototype.apiInc = function apiInc(delta) {
	log.debug('%s.apiInc(%s)', this, delta);
	return this.inc(delta);
};


/**
 * Decrements the value of the property by the given amount.
 *
 * @param {number} delta decrement by this much
 * @returns {number} actual delta (may be different from given delta
 *          due to limits)
 */
PropertyApi.prototype.apiDec = function apiDec(delta) {
	log.debug('%s.apiDec(%s)', this, delta);
	return this.dec(delta);
};


/**
 * Multiplies the value of the property with the given factor.
 *
 * @param {number} factor multiplication factor
 * @returns {number} value delta
 */
PropertyApi.prototype.apiMultiply = function apiMultiply(factor) {
	log.debug('%s.apiMultiply(%s)', this, factor);
	return this.mult(factor);
};
