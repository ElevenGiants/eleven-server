module.exports = Group;


var GameObject = require('model/GameObject');
var util = require('util');


util.inherits(Group, GameObject);
Group.prototype.TSID_INITIAL = 'R';


/**
 * @constructor
 * @augments GameObject
 */
function Group(data) {
	Group.super_.call(this, data);
	//TODO...
}
