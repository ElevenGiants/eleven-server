'use strict';

module.exports = Group;


var GameObject = require('model/GameObject');
var pers = require('data/pers');
var rpc = require('data/rpc');
var slack = require('comm/slack');
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
	slack.patchGroup(this);
}


/**
 * Creates a new `Group` instance and adds it to persistence.
 *
 * @param {string} [classTsid] specific class of the group
 * @param {string} [hubId] hub to attach the group to
 * @returns {object} a `Group` instance wrapped in a {@link
 * module:data/persProxy|persistence proxy}
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
