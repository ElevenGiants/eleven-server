module.exports = Quest;


var GameObject = require('model/GameObject');
var util = require('util');


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
