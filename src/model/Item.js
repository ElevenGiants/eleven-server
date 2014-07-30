module.exports = Item;


var GameObject = require('model/GameObject');
var util = require('util');


util.inherits(Item, GameObject);
Item.prototype.TSID_INITIAL = 'I';


/**
 * @constructor
 * @augments GameObject
 */
function Item(data) {
	Item.super_.call(this, data);
	//TODO...
}
