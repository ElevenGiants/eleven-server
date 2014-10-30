'use strict';

module.exports = Quest;


var assert = require('assert');
var GameObject = require('model/GameObject');
var pers = require('data/pers');
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
 * @returns {object} a `Quest` instance wrapped in a {@link
 * module:data/persProxy|persistence proxy}
 */
Quest.create = function create(classTsid, owner) {
	assert(utils.isLoc(owner) || utils.isPlayer(owner), util.format(
		'invalid Quest owner: %s', owner));
	var quest = pers.create(Quest, {class_tsid: classTsid, owner: owner});
	return quest;
};
