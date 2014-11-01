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
 * Sends a message to the player's client.
 *
 * @param {object} msg the message to send
 */
PlayerApi.prototype.apiSendMsg = function apiSendMsg(msg) {
	log.debug('%s.apiSendMsg', this);
	this.send(msg);
};
