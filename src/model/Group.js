'use strict';

module.exports = Group;


var GameObject = require('model/GameObject');
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
	Group.super_.call(this, data);
}
