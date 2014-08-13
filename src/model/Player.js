module.exports = Player;


var Prop = require('model/Property');
var Bag = require('model/Bag');
var util = require('util');


util.inherits(Player, Bag);
Player.prototype.TSID_INITIAL = 'P';


// the JSON data in persistence does not contain specific class information for
// object-type values, so we need a list of things that are of type 'Property'
var PROPS = {
	metabolics: ['energy', 'mood'],
	stats: [
		'xp', 'currants', 'donation_xp_today', 'imagination', 'credits',
		'quoins_today', 'meditation_today', 'rube_trades', 'rube_lure_disabled'],
	daily_favor: [
		'alph', 'cosma', 'friendly', 'grendaline', 'humbaba', 'lem', 'mab',
		'pot', 'spriggan', 'ti', 'zille'],
};


/**
 * Generic constructor for both instantiating an existing game
 * character (from JSON data), as well as creating a new one.
 *
 * @param {object} [data] initialization values (properties are
 *        shallow-copied into the instance)
 * @constructor
 * @augments Bag
 */
function Player(data) {
	Player.super_.call(this, data);
	// convert selected properties to "Property" instances (works with simple
	// int values as well as serialized Property instances)
	for (var group in PROPS) {
		if (!this[group]) this[group] = {};
		for (var i = 0; i < PROPS[group].length; i++) {
			var key = PROPS[group][i];
			this[group][key] = new Prop(key, this[group][key]);
		}
	}
}
