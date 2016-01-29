'use strict';


/**
 * Model layer API functions for the {@link Player} class (used by GSJS
 * code). These functions are attached to `Player.prototype` at server
 * startup.
 *
 * @mixin
 */
var PlayerApi = module.exports = function PlayerApi() {};


/**
 * Checks if the player is holding an editing lock for his/her current
 * location.
 *
 * @returns {boolean} `true` if the current location is locked by the
 *          player
 */
PlayerApi.prototype.apiPlayerHasLockForCurrentLocation =
	function apiPlayerHasLockForCurrentLocation() {
	log.trace('%s.apiPlayerHasLockForCurrentLocation()', this);
	//TODO: implement location locking
	return false;
};


/**
 * Tries to acquire an exclusive access lock on an item in the player's
 * inventory (e.g. for item verb processing). The lock is released
 * automatically at the end of the current request.
 *
 * Locking is an "expensive" operation and should only be used
 * where necessary.
 *
 * @param {number|string} slotOrPath a slot number or a path string
 * @returns {Item|null} the requested item, or `null` if not found or
 *          if the lock could not be acquired
 */
PlayerApi.prototype.apiLockStack = function apiLockStack(slotOrPath) {
	log.trace('%s.apiLockStack(%s)', this, slotOrPath);
	//TODO: locking
	return this.getSlotOrPath(slotOrPath);
};


/**
 * Add (part of) an item stack into a specific slot of either the
 * player inventory, or one of the bags therein, merging with an
 * existing item in that slot if necessary.
 *
 * @param {Item} item item stack to add; may be deleted in the process
 * @param {number} slot slot index in player inventory or bag to add to
 * @param {string} [path] path to target bag; if `null`, the player
 *        inventory is targeted
 * @param {number} [amount] amount of the item stack to add/distribute;
 *        if not specified, the whole stack is processed
 * @returns {number} amount of remaining items
 */
PlayerApi.prototype.apiAddStack = function apiAddStack(item, slot, path, amount) {
	log.debug('%s.apiAddStack(%s, %s, %s, %s)', this, item, slot, path, amount);
	return this.addToAnySlot(item, slot, slot, path, amount);
};


/**
 * Distribute (part of) an item stack into a range of inventory slots
 * of either the player itself, or one of its bags, using empty slots
 * or merging with existing items.
 *
 * @param {Item} item item stack to add; may be deleted in the process
 * @param {number} maxSlot only slots up to this index are considered
 * @param {string} [path] path to target bag; if `null`, the player
 *        inventory is targeted
 * @param {number} [amount] amount of the item stack to add/distribute;
 *        if not specified, the whole stack is processed
 * @returns {number} amount of remaining items
 */
PlayerApi.prototype.apiAddStackAnywhere =
	function apiAddStackAnywhere(item, maxSlot, path, amount) {
	log.debug('%s.apiAddStackAnywhere(%s, %s, %s, %s)', this, item, maxSlot,
		path, amount);
	return this.addToAnySlot(item, 0, maxSlot, path, amount);
};


/**
 * Gets a list of items of a particular type from the player's inventory.
 *
 * @param {string} classTsid class ID of the items to return
 * @param {number} [minCount] when given, only items with a combined stack size
 *        of at least this number are returned (i.e. not necessarily all
 *        available items)
 * @returns {object} a hash with the matching items
 */
PlayerApi.prototype.apiInventoryGetItems =
	function apiInventoryGetItems(classTsid, minCount) {
	log.debug('%s.apiInventoryGetItems(%s, %s)', this, classTsid, minCount);
	return this.getClassItems(classTsid, minCount > 0 ? minCount : undefined);
};


/**
 * Sends a message to the player's client.
 *
 * @param {object} msg the message to send
 */
PlayerApi.prototype.apiSendMsg = function apiSendMsg(msg) {
	log.debug('%s.apiSendMsg', this);
	this.send(msg);
};


/**
 * Sends a message to the player's client, without adding the 'changes'
 * segment.
 *
 * @param {object} msg the message to send
 */
PlayerApi.prototype.apiSendMsgAsIs = function apiSendMsgAsIs(msg) {
	log.debug('%s.apiSendMsgAsIs', this);
	this.send(msg, true);
};


/**
 * Sends a message to all players in this player's location.
 *
 * @param {object} msg the message to send
 */
PlayerApi.prototype.apiSendLocMsg = function apiSendLocMsg(msg) {
	log.debug('%s.apiSendLocMsg', this);
	this.location.send(msg);
};


/**
 * Sends a message to all players in this player's location, excluding
 * the player him/herself.
 *
 * @param {object} msg the message to send
 */
PlayerApi.prototype.apiSendLocMsgX = function apiSendLocMsgX(msg) {
	log.debug('%s.apiSendLocMsgX', this);
	this.location.send(msg, false, this);
};


/**
 * Enqueues an announcement for the player.
 *
 * @param {object} annc announcement data
 */
PlayerApi.prototype.apiSendAnnouncement = function apiSendAnnouncement(annc) {
	log.debug('%s.apiSendAnnouncement(%s)', this, typeof annc !== 'object' ?
		'' : (annc.type + '/' + annc.uid));
	this.queueAnnc(annc);
};


/**
 * Checks if moving to another location requires reconnecting to a
 * different game server, and returns the appropriate connection data
 * if so. Also prepares the client for the move if necessary.
 *
 * @param {string} locTsid TSID of the location the player is moving to
 * @returns {object|null} `null` if no reconnection to another server
 *          necessary, otherwise an object like:
 * ```{
 *     hostAndPort: "<host>:<port>",
 *     token: "<TOKEN_FOR_CONNECTION_TO_OTHER_GS>"
 * }```
 */
PlayerApi.prototype.apiCheckIfNeedToMoveToAnotherGSAndGetMoveData = function
	apiCheckIfNeedToMoveToAnotherGSAndGetMoveData(locTsid) {
	log.debug('%s.apiCheckIfNeedToMoveToAnotherGSAndGetMoveData(%s)', this, locTsid);
	var moveData = this.gsMoveCheck(locTsid);
	if (moveData) {
		return {hostAndPort: moveData.hostPort, token: moveData.token};
	}
	return null;
};


/**
 * Initiates a GS-local location move by removing this player from the
 * current location, calling various "onExit" handlers and updating the
 * `location` property with the new location.
 *
 * @param {Location} newLoc the target location
 * @param {number} x x coordinate of the player in the new location
 * @param {number} y y coordinate of the player in the new location
 */
PlayerApi.prototype.apiStartLocationMoveX = function
	apiStartLocationMoveX(newLoc, x, y) {
	log.debug('%s.apiStartLocationMoveX(%s, %s, %s)', this, newLoc, x, y);
	this.startMove(newLoc, x, y);
};


/**
 * Finishes a GS-local location move by adding the player to the list
 * of players in the new location, and calling various "onEnter"
 * handlers. The player's `location` property already needs to
 * reference the "new" location at this point.
 *
 * @param {Location} oldLoc the player's previous location
 */
PlayerApi.prototype.apiEndLocationMoveX = function apiEndLocationMoveX(oldLoc) {
	log.debug('%s.apiEndLocationMoveX(%s)', this, oldLoc);
	this.endMove();
};


PlayerApi.prototype.apiEndLocationMove = function apiEndLocationMove(newLoc) {
	log.debug('%s.apiEndLocationMove(%s)', this, newLoc);
	//TODO: implement&document me
};


/**
 * Moves a player that is not currently logged in to another location.
 *
 * @param {Location} newLoc the target location
 * @param {number} x x coordinate of the player in the new location
 * @param {number} y y coordinate of the player in the new location
 */
PlayerApi.prototype.apiMoveOfflinePlayerToAnotherLocation =
	function apiMoveOfflinePlayerToAnotherLocation(newLoc, x, y) {
	log.debug('%s.apiMoveOfflinePlayerToAnotherLocation(%s, %s, %s)', this,
		newLoc, x, y);
	this.startMove(newLoc, x, y);
};


PlayerApi.prototype.apiStartFollowing = function apiStartFollowing(leaderTsid) {
	log.debug('%s.apiStartFollowing(%s)', this, leaderTsid);
	//TODO: implement&document me
	log.warn('TODO Player.apiStartFollowing not implemented yet');
};


PlayerApi.prototype.apiStopFollowing = function apiStopFollowing() {
	log.debug('%s.apiStopFollowing', this);
	//TODO: implement&document me
	log.warn('TODO Player.apiStopFollowing not implemented yet');
};


PlayerApi.prototype.apiRemoveAllFollowers = function apiRemoveAllFollowers() {
	log.debug('%s.apiRemoveAllFollowers', this);
	//TODO: implement&document me
	log.warn('TODO Player.apiRemoveAllFollowers not implemented yet');
};


PlayerApi.prototype.apiPlayerCanReach = function apiPlayerCanReach(x, y) {
	log.debug('%s.apiPlayerCanReach', this);
	//TODO: implement&document me
	log.warn('TODO Player.apiPlayerCanReach not implemented yet');
	return true;
};
