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
	this.addItem(item, x, y, typeof merge === 'boolean' ? !merge : false);
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
