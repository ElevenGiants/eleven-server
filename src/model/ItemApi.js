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
