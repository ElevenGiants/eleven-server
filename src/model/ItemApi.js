'use strict';


/**
 * Model layer API functions for the {@link Item} class (used by GSJS
 * code). These functions are attached to `Item.prototype` at server
 * startup.
 *
 * @mixin
 */
var ItemApi = module.exports = function ItemApi() {};


/**
 * Retrieves the object that determines the actual position of this
 * item in its current location. This has three cases:
 *
 * * item is in player's inventory: returns player object
 * * item is in location, outside of any bags: return the item itself
 * * item is in a bag within a location: return the top-level bag
 *
 * @returns {Player|Bag|Item} the game object that determines the
 *          item's actual x/y position, or `undefined` if no such
 *          object exists (e.g. while the item is being created)
 */
ItemApi.prototype.apiGetLocatableContainerOrSelf =
	function apiGetLocatableContainerOrSelf() {
	log.trace('%s.apiGetLocatableContainerOrSelf()', this);
	return this.getPosObject();
};


ItemApi.prototype.apiPutBack = function apiPutBack() {
	log.trace('%s.apiPutBack', this);
	//TODO: implement&document me
};


ItemApi.prototype.apiSetHitBox = function apiSetHitBox(w, h) {
	log.debug('%s.apiSetHitBox(%s, %s)', this, w, h);
	//TODO: implement&document me
	log.warn('TODO Item.apiSetHitBox not implemented yet');
};


ItemApi.prototype.apiAddHitBox = function apiAddHitBox(name, w, h) {
	log.debug('%s.apiAddHitBox(%s, %s, %s)', this, name, w, h);
	//TODO: implement&document me
	log.warn('TODO Item.apiAddHitBox not implemented yet');
};


ItemApi.prototype.apiRemoveHitBox = function apiRemoveHitBox(name) {
	log.debug('%s.apiRemoveHitBox(%s)', this, name);
	//TODO: implement&document me
	log.warn('TODO Item.apiRemoveHitBox not implemented yet');
};


/**
 * En/disable collision detection with players for this item.
 *
 * @param {boolean} enable
 */
ItemApi.prototype.apiSetPlayersCollisions = function
	apiSetPlayersCollisions(enable) {
	log.debug('%s.apiSetPlayersCollisions(%s)', this, enable);
	this.collDet = enable;
};


/**
 * Sets the item's coordinates within its current location.
 *
 * @param {number} x
 * @param {number} y
 */
ItemApi.prototype.apiSetXY = function apiSetXY(x, y) {
	log.trace('%s.apiSetXY(%s, %s)', this, x, y);
	this.setXY(x, y);
};


ItemApi.prototype.apiStopMoving = function apiStopMoving() {
	log.debug('%s.apiStopMoving()', this);
	//TODO: implement&document me
	log.warn('TODO Item.apiStopMoving not implemented yet');
};
