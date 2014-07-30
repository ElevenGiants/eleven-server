module.exports = Location;


var GameObject = require('model/GameObject');
var util = require('util');


util.inherits(Location, GameObject);
Location.prototype.TSID_INITIAL = 'L';


/**
 * @constructor
 * @augments GameObject
 */
function Location(data) {
	Location.super_.call(this, data);
	//TODO...
}
