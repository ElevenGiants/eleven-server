'use strict';


/**
 * Model layer API functions for the {@link Location} class (used by
 * GSJS code). These functions are attached to `Location.prototype` at
 * server startup.
 *
 * @mixin
 */
var LocationApi = module.exports = function LocationApi() {};


/**
 * Puts the item into the location at the given position, merging it
 * with existing nearby items of the same class.
 *
 * @param {Item} item the item to place
 * @param {number} x x coordinate of the item's position
 * @param {number} y y coordinate of the item's position
 * @param {boolean} [merge] if `false`, item will **not** be merged
 *        with other nearby items (default behavior if omitted is
 *        to merge)
 */
LocationApi.prototype.apiPutItemIntoPosition =
	function apiPutItemIntoPosition(item, x, y, merge) {
	log.debug('%s.apiPutItemIntoPosition(%s, %s, %s, %s)', this, item, x, y, merge);
	this.addItem(item, x, y, typeof merge === 'boolean' ? !merge : false);
};


LocationApi.prototype.apiGetPointOnTheClosestPlatformLineBelow =
	function apiGetPointOnTheClosestPlatformLineBelow(x, y) {
	log.debug('%s.apiGetPointOnTheClosestPlatformLineBelow(%s, %s)', this, x, y);
	//TODO implement&document me
	log.warn('TODO Location.apiGetPointOnTheClosestPlatformLineBelow not ' +
		'implemented yet');
	return {x: 1, y: 1};
};


LocationApi.prototype.apiGetPointOnTheClosestPlatformLineAbove =
	function apiGetPointOnTheClosestPlatformLineAbove(x, y) {
	log.debug('%s.apiGetPointOnTheClosestPlatformLineAbove(%s, %s)', this, x, y);
	//TODO implement&document me
	log.warn('TODO Location.apiGetPointOnTheClosestPlatformLineAbove not ' +
		'implemented yet');
	return {x: 1, y: 1};
};


/**
 * Sends a message to all players in this location.
 *
 * @param {object} msg the message to send
 */
LocationApi.prototype.apiSendMsg = function apiSendMsg(msg) {
	log.debug('%s.apiSendMsg', this);
	this.send(msg, false);
};


/**
 * Sends a message to all players in this location (except those in the
 * optional exclusion parameter).
 *
 * See {@link Location#send} for details about the parameters.
 *
 * @param {object} msg the message to send
 * @param {object|array|string|Player} exclude exclusion parameter
 */
LocationApi.prototype.apiSendMsgX = function apiSendMsgX(msg, exclude) {
	log.debug('%s.apiSendMsgX', this);
	this.send(msg, false, exclude);
};


/**
 * Sends a message to all players in this location, without adding the
 * 'changes' segment.
 *
 * @param {object} msg the message to send
 */
LocationApi.prototype.apiSendMsgAsIs = function apiSendMsgAsIs(msg) {
	log.debug('%s.apiSendMsgAsIs', this);
	this.send(msg, true);
};


/**
 * Sends a message to all players in this location (except those in the
 * optional exclusion parameter), without adding the 'changes' segment.
 *
 * See {@link Location#send} for details about the parameters.
 *
 * @param {object} msg the message to send
 * @param {object|array|string|Player} exclude exclusion parameter
 */
LocationApi.prototype.apiSendMsgAsIsX = function apiSendMsgAsIsX(msg, exclude) {
	log.debug('%s.apiSendMsgAsIsX', this);
	this.send(msg, true, exclude);
};


/**
 * Adds an announcement to the announcements queue for all players in
 * the location.
 *
 * @param {object} annc announcement data
 */
LocationApi.prototype.apiSendAnnouncement = function apiSendAnnouncement(annc) {
	log.debug('%s.apiSendAnnouncement', this);
	this.queueAnnc(annc);
};


/**
 * Adds an announcement to the announcements queue for all players in
 * the location except one.
 *
 * @param {object} annc announcement data
 * @param {Player} [skipPlayer] announcement is **not** queued for this
 *        player
 */
LocationApi.prototype.apiSendAnnouncementX = function
	apiSendAnnouncementX(annc, skipPlayer) {
	log.debug('%s.apiSendAnnouncementX', this);
	this.queueAnnc(annc, skipPlayer);
};


/**
 * Initiates an inter-GS location move by removing the player from the
 * current location, calling various "onExit" handlers and updating the
 * player's `location` property with the new location.
 *
 * @param {Player} pc the player to move out
 * @param {Location} newLoc the target location
 * @param {number} x x coordinate of the player in the new location
 * @param {number} y y coordinate of the player in the new location
 */
LocationApi.prototype.apiMoveOutX = function apiMoveOutX(pc, newLoc, x, y) {
	log.debug('%s.apiMoveOutX(%s, %s, %s, %s)', this, pc, newLoc, x, y);
	pc.startMove(newLoc, x, y);
	// notify other clients (for unknown reasons, GSJS doesn't do that in this case)
	this.send({
		type: 'pc_signpost_move',
		pc: pc.make_hash_with_location(),
	}, false, pc);
};


/**
 * Finishes an inter-GS location move by adding the player to the list
 * of players in the new (this) location, and calling various "onEnter"
 * handlers.
 *
 * @param {Player} pc player to move in
 */
LocationApi.prototype.apiMoveIn = function apiMoveIn(pc) {
	log.debug('%s.apiMoveIn(%s)', this, pc);
	pc.endMove();
};


/**
 * Tries to acquire a lock on an item in the location for exclusive
 * access (e.g. for item verb processing). The lock is released
 * automatically at the end of the current request.
 *
 * Locking is an "expensive" operation and should only be used
 * where necessary.
 *
 * @param {string} path a path string pointing to an item in this
 *        location (like "B1/B2/I3")
 * @returns {Item|null} the requested item, or `null` if not found or
 *          if the lock could not be acquired
 */
LocationApi.prototype.apiLockStack = function apiLockStack(path) {
	log.trace('%s.apiLockStack(%s)', this, path);
	//TODO: locking
	return this.getPath(path);
};


LocationApi.prototype.apiNotifyItemStateChanged =
	function apiNotifyItemStateChanged(item) {
	log.debug('%s.apiNotifyItemStateChanged(%s)', this, item);
	//TODO implement&document me
	log.warn('TODO Location.apiNotifyItemStateChanged not implemented yet');
};
