module.exports = Player;


var Bag = require('model/Bag');
var util = require('util');


util.inherits(Player, Bag);
Player.prototype.TSID_INITIAL = 'P';


/**
 * @constructor
 * @augments Bag
 */
function Player(data) {
	Player.super_.call(this, data);
	//TODO...
}
