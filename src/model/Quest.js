module.exports = Quest;


var GameObject = require('model/GameObject');
var util = require('util');


util.inherits(Quest, GameObject);
Quest.prototype.TSID_INITIAL = 'Q';


/**
 * @constructor
 * @augments GameObject
 */
function Quest(data) {
	Quest.super_.call(this, data);
	//TODO...
}
