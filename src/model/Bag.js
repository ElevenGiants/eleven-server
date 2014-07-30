module.exports = Bag;


var Item = require('model/Item');
var util = require('util');


util.inherits(Bag, Item);
Bag.prototype.TSID_INITIAL = 'B';


/**
 * @constructor
 * @augments Item
 */
function Bag(data) {
	Bag.super_.call(this, data);
	//TODO...
}
