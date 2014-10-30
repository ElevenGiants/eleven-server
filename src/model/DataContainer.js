'use strict';

module.exports = DataContainer;


var assert = require('assert');
var GameObject = require('model/GameObject');
var pers = require('data/pers');
var util = require('util');
var utils = require('utils');


util.inherits(DataContainer, GameObject);
DataContainer.prototype.TSID_INITIAL = 'D';


/**
 * Generic constructor for both instantiating an existing data
 * container object (from JSON data), and creating a new one.
 *
 * @param {object} [data] initialization values (properties are
 *        shallow-copied into the object)
 * @constructor
 * @augments GameObject
 */
function DataContainer(data) {
	DataContainer.super_.call(this, data);
}


/**
 * Creates a new `DataContainer` instance and adds it to persistence.
 *
 * @param {Location|Group|Item|Bag|Player} owner top-level game object
 *        this DC belongs to
 * @returns {object} a `DataContainer` instance wrapped in a {@link
 * module:data/persProxy|persistence proxy}
 */
DataContainer.create = function create(owner) {
	assert(utils.isLoc(owner) || utils.isItem(owner) || utils.isGroup(owner),
		util.format('invalid DC owner: %s', owner));
	var dc = pers.create(DataContainer, {owner: owner});
	return dc;
};
