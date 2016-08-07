'use strict';

module.exports = Quest;


var assert = require('assert');
var GameObject = require('model/GameObject');
var pers = require('data/pers');
var RC = require('data/RequestContext');
var RQ = require('data/RequestQueue');
var util = require('util');
var utils = require('utils');


util.inherits(Quest, GameObject);
Quest.prototype.TSID_INITIAL = 'Q';


/**
 * Generic constructor for both instantiating an existing quest object
 * (from JSON data), and creating a new one.
 *
 * @param {object} [data] initialization values (properties are
 *        shallow-copied into the object)
 * @constructor
 * @augments GameObject
 */
function Quest(data) {
	Quest.super_.call(this, data);
}


/**
 * Creates a new `Quest` instance and adds it to persistence.
 *
 * @param {string} classTsid specific class of the quest
 * @param {Location|Player} owner top-level game object this quest
 *        belongs to
 * @returns {object} a `Quest` object
 */
Quest.create = function create(classTsid, owner) {
	assert(utils.isLoc(owner) || utils.isPlayer(owner), util.format(
		'invalid Quest owner: %s', owner));
	var quest = pers.create(Quest, {class_tsid: classTsid, owner: owner});
	return quest;
};


/**
 * Retrieves the request queue for this quest (typically, the queue of its
 * owner).
 *
 * @returns {RequestQueue} the request queue for this DC
 */
Quest.prototype.getRQ = function getRQ() {
	if (this.owner) {
		return this.owner.getRQ();
	}
	return RQ.getGlobal();
};


/**
 * Schedules this quest for deletion after the current request, making sure the
 * respective reference is removed from the owner's quest DCs or job data in
 * persistence.
 */
Quest.prototype.del = function del() {
	log.trace('del %s', this);
	Quest.super_.prototype.del.call(this);
	if (utils.isPlayer(this.owner)) {
		for (var key in this.owner.quests) {
			RC.setDirty(this.owner.quests[key]);
		}
	}
	else if (utils.isLoc(this.owner)) {
		RC.setDirty(this.owner);
	}
};
