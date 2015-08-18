'use strict';


/**
 * Model layer API functions for the {@link GameObject} class (used by
 * GSJS code). These functions are attached to `GameObject.prototype`
 * at server startup.
 *
 * @mixin
 */
var GameObjectApi = module.exports = function GameObjectApi() {};


/**
 * Schedules this object for deletion after the current request.
 */
GameObjectApi.prototype.apiDelete = function apiDelete() {
	log.debug('%s.apiDelete()', this);
	this.del();
};


/**
 * Schedules a function of the game object to be called after a given
 * delay. Only one timer can be defined per function; if there already
 * is one, subsequent requests are ignored until that timer has been
 * executed.
 *
 * @param {string} fname name of the function to call (must be a method
 *        of this `GameObject`)
 * @param {number} delay delay before function call in ms
 * @param {...*} [args] arbitrary arguments for the called function
 */
GameObjectApi.prototype.apiSetTimer = function apiSetTimer(fname, delay) {
	log.debug('%s.apiSetTimer(%s)', this,
		Array.prototype.slice.call(arguments).join(', '));
	var args = Array.prototype.slice.call(arguments, apiSetTimer.length);
	this.setGsTimer({fname: fname, delay: delay, args: args});
};


/**
 * @deprecated use {@link GameObjectApi#apiSetTimer|apiSetTimer} instead
 */
GameObjectApi.prototype.apiSetTimerX = function apiSetTimerX() {
	this.apiSetTimer.apply(this, arguments);
};


/**
 * Schedules a function of the game object to be called after a given
 * delay. The same as {@link GameObjectApi#apiSetTimer|apiSetTimer},
 * except that it allows the same function to be scheduled multiple
 * times.
 *
 * @param {string} fname name of the function to call (must be a method
 *        of this `GameObject`)
 * @param {number} delay delay before function call in ms
 * @param {...*} [args] arbitrary arguments for the called function
 */
GameObjectApi.prototype.apiSetTimerMulti = function apiSetTimerMulti(fname, delay) {
	log.debug('%s.apiSetTimerMulti(%s)', this,
		Array.prototype.slice.call(arguments).join(', '));
	var args = Array.prototype.slice.call(arguments, apiSetTimerMulti.length);
	this.setGsTimer({fname: fname, delay: delay, args: args, multi: true});
};


/**
 * Removes the timer for a function call set by {@link
 * GameObjectApi#apiSetTimer|apiSetTimer} if there is one.
 *
 * @param {string} fname name of the function whose timer to remove
 * @returns {boolean} `true` if a timer existed and was removed
 */
GameObjectApi.prototype.apiCancelTimer = function apiCancelTimer(fname) {
	log.debug('%s.apiCancelTimer(%s)', this, fname);
	return this.cancelGsTimer(fname);
};


/**
 * Checks if a timer for a function call (set by {@link
 * GameObjectApi#apiSetTimer|apiSetTimer}) exists.
 *
 * @param {string} fname name of the function to check
 * @returns {boolean} `true` if a timer exists
 */
GameObjectApi.prototype.apiTimerExists = function apiTimerExists(fname) {
	log.debug('%s.apiTimerExists(%s)', this, fname);
	return this.gsTimerExists(fname);
};


/**
 * Schedules a function of the game object to be called periodically.
 * Intervals are persistent, i.e. they only need to be created once
 * during the object's lifetime.
 *
 * @param {string} fname name of the function to call (must be a method
 *        of this `GameObject`)
 * @param {number} period interval at which the function will be
 *        called, in **minutes**
 */
GameObjectApi.prototype.apiSetInterval = function apiSetInterval(fname, period) {
	log.debug('%s.apiSetInterval(%s, %s)', this, fname, period);
	this.setGsTimer({fname: fname, interval: true, delay: period * 60000});
};


/**
 * Cancel periodic execution of a previously defined interval.
 *
 * @param {string} fname name of the function whose interval setting
 *        should be cleared
 */
GameObjectApi.prototype.apiClearInterval = function apiClearInterval(fname) {
	log.debug('%s.apiClearInterval(%s)', this, fname);
	this.cancelGsTimer(fname, true);
};


/**
 * Checks if an interval has been set up for a given function call
 * (through {@link GameObjectApi#apiSetInterval|apiSetInterval}).
 *
 * @param {string} fname name of the function to check
 * @returns {boolean} `true` if an interval exists
 */
GameObjectApi.prototype.apiIntervalExists = function apiIntervalExists(fname) {
	log.debug('%s.apiIntervalExists(%s)', this, fname);
	return this.gsTimerExists(fname, true);
};
