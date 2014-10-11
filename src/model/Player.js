'use strict';

module.exports = Player;


var assert = require('assert');
var Prop = require('model/Property');
var Bag = require('model/Bag');
var rpc = require('data/rpc');
var util = require('util');
var utils = require('utils');


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
	utils.addNonEnumerable(this, 'session');
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


/**
 * Initializes the instance for an active player; called when a client
 * is actually logging in on this GS as this player.
 *
 * @param {Session} session the session for the connected client
 * @param {boolean} isRelogin `true` if the client is already in-game
 *        (e.g. after an inter-GS move or short connection loss);
 *        otherwise, this is a "full" login after client startup
 */
Player.prototype.onLoginStart = function(session, isRelogin) {
	this.session = session;
	//TODO: start onTimePlaying interval
	if (isRelogin) {
		this.onRelogin();
	}
	else {
		this.onLogin();
	}
};


/**
 * Performs all kinds of shutdown/cleanup tasks when a client that was
 * logged in as this player is logging out, or disconnects.
 * This should be called in the following scenarios:
 *
 * * "regular" logout (`logout` request, triggered by user action, e.g.
 *   selecting "Exit the world" in the menu or closing the browser tab)
 * * network error (socket closed without preceding `logout` request)
 * * player moving to another GS (location change)
 */
Player.prototype.onDisconnect = function() {
	// properly move out of location in case of an actual logout request, or
	// error/connection loss (in case of an inter-GS moves, the location already
	// points to another castle^Wserver)
	if (rpc.isLocal(this.location)) {
		//TODO: clear onTimePlaying interval
		// remove from location, onExit callbacks etc.
		this.startMove();
		// GSJS logout event
		this.onLogout();
		//TODO: send pc_logout message to let other clients in same location know we're gone
	}
	// in any case, stop timers etc and unload from live object cache
	this.unload();
	// unlink the session, so this function won't be accidentally called again
	this.session = null;
};


Player.prototype.unload = function() {
	//TODO...
};


/**
 * Initiates a location move for this player. Removes the player from
 * the current location, calls various "onExit" handlers and updates
 * the `location` property with the new location. The player is *not*
 * added to the list of players in the new location yet.
 *
 * @param {Location} [newLoc] the target location (if undefined, the
 *        current location stays unchanged; this is used during logout)
 * @param {number} [x] x coordinate of the player in the new location
 * @param {number} [y] y coordinate of the player in the new location
 */
Player.prototype.startMove = function(newLoc, x, y) {
	if (newLoc) {
		log.info('start move to %s (%s/%s)', newLoc, x, y);
	}
	else {
		log.info('moving out');  // logout case
	}
	if (this.location) {
		// remove from current location
		delete this.location.players[this.tsid];
		// handle exit callbacks
		if (typeof this.location.onPlayerExit === 'function') {
			this.location.onPlayerExit(this, newLoc);
		}
		for (var k in this.location.items) {
			var it = this.location.items[k];
			if (typeof it.onPlayerExit === 'function') {
				try {
					it.onPlayerExit(this);
				}
				catch (e) {
					log.error(e, 'error in %s.onPlayerExit handler', it);
				}
			}
		}
	}
	if (newLoc) {
		// update location and position
		this.location = newLoc;
		this.setXY(x, y);
	}
};


/**
 * Finishes a location move for this player. Adds the player to the
 * list of players in the new location and calls various "onEnter"
 * handlers. The `location` property already needs to point to the
 * "new" location at this point (set in
 * {@link Player#startMove|startMove}).
 */
Player.prototype.endMove = function() {
	log.info('end move to %s', this.location);
	assert(utils.isLoc(this.location), util.format(
		'invalid location property: %s', this.location));
	// add to active player list of new location
	this.location.players[this.tsid] = this;
	// handle enter callbacks
	if (typeof this.location.onPlayerEnter === 'function') {
		this.location.onPlayerEnter(this);
	}
	for (var k in this.location.items) {
		var it = this.location.items[k];
		if (typeof it.onPlayerEnter === 'function') {
			try {
				it.onPlayerEnter(this);
			}
			catch (e) {
				log.error(e, 'error in %s.onPlayerEnter handler', it);
			}
		}
	}
};
