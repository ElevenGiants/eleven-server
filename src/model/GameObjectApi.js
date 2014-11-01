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
 * Schedules a function of the game object to be called after a given
 * delay.
 *
 * @param {string} fname name of the function to call (must be a method
 *        of this `GameObject`)
 * @param {number} delay delay before function call in ms
 */
//TODO: append next line to jsdocs when this is fixed: <https://github.com/jscs-dev/jscs-jsdoc/issues/35>
// * @param {...*} arg arbitrary arguments for the called function
GameObjectApi.prototype.apiSetTimer = function apiSetTimer(fname, delay) {
	log.debug('%s.apiSetTimer(%s)', this,
		Array.prototype.slice.call(arguments).join(', '));
	//TODO implement me
	log.warn('TODO GameObject.apiSetTimer not implemented yet');
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
	//TODO implement me
	log.warn('TODO GameObject.apiCancelTimer not implemented yet');
	return false;
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
	//TODO implement me
	log.warn('TODO GameObject.apiTimerExists not implemented yet');
	return false;
};
