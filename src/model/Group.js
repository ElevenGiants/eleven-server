'use strict';

module.exports = Group;


var GameObject = require('model/GameObject');
var pers = require('data/pers');
var rpc = require('data/rpc');
var RQ = require('data/RequestQueue');
var slackChat = require('comm/slackChat');
var util = require('util');


util.inherits(Group, GameObject);
Group.prototype.TSID_INITIAL = 'R';


/**
 * Generic constructor for both instantiating an existing group object
 * (from JSON data), and creating a new one.
 *
 * @param {object} [data] initialization values (properties are
 *        shallow-copied into the object)
 * @constructor
 * @augments GameObject
 */
function Group(data) {
	data = data || {};
	if (!data.tsid) data.tsid = rpc.makeLocalTsid(Group.prototype.TSID_INITIAL);
	Group.super_.call(this, data);
	slackChat.patchGroup(this);
}


/**
 * Creates a new `Group` instance and adds it to persistence.
 *
 * @param {string} [classTsid] specific class of the group
 * @param {string} [hubId] hub to attach the group to
 * @returns {object} a `Group` object
 */
Group.create = function create(classTsid, hubId) {
	var data = {};
	if (classTsid) {
		data.class_tsid = classTsid;
	}
	if (hubId) {
		data.hubid = hubId;
	}
	return pers.create(Group, data);
};


/**
 * Retrieves the request queue for this group.
 *
 * @returns {RequestQueue} the request queue for this group
 */
Group.prototype.getRQ = function getRQ() {
	return RQ.get(this);
};


/**
 * Schedules this group to be released from the live object cache after all
 * pending requests for it have been handled. When this is called, the group's
 * request queue will not accept any new requests.
 *
 * @param {function} [callback] for optional error handling
 */
Group.prototype.unload = function unload(callback) {
	var self = this;
	this.getRQ().push('unload', function unloadReq() {
		Group.super_.prototype.unload.call(self);
	}, true, undefined, callback);
};
