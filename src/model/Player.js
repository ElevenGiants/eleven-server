'use strict';

module.exports = Player;


var assert = require('assert');
var auth = require('comm/auth');
var config = require('config');
var Prop = require('model/Property');
var Bag = require('model/Bag');
var pers = require('data/pers');
var rpc = require('data/rpc');
var RC = require('data/RequestContext');
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
 * Creates a new `Player` instance and adds it to persistence.
 *
 * @param {object} [data] player data; must contain everything required
 *        for a new player
 * @returns {object} a `Player` instance wrapped in a {@link
 * module:data/persProxy|persistence proxy}
 */
Player.create = function create(data) {
	assert(typeof data === 'object', 'minimal player data set required');
	assert(typeof data.userid === 'string' && data.userid.length > 0,
		util.format('invalid user ID: "%s"', data.userid));
	assert(typeof data.label === 'string' && data.label.length > 2,
		util.format('invalid player label: "%s"', data.label));
	assert(utils.isLoc(data.location), 'location required');
	//TODO: a lot more data validation should probably happen here
	data.class_tsid = data.class_tsid || 'human';
	var ret = pers.create(Player, data);
	log.info('%s was imagined!', ret);
	return ret;
};


/**
 * Initializes the instance for an active player; called when a client
 * is actually logging in on this GS as this player.
 *
 * @param {Session} session the session for the connected client
 * @param {boolean} isRelogin `true` if the client is already in-game
 *        (e.g. after an inter-GS move or short connection loss);
 *        otherwise, this is a "full" login after client startup
 */
Player.prototype.onLoginStart = function onLoginStart(session, isRelogin) {
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
Player.prototype.onDisconnect = function onDisconnect() {
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


/**
 * Removes the player and all related objects (inventory items, DCs,
 * quests etc) from the GS live object cache (or more specifically,
 * schedules their removal at the end of the current request).
 */
Player.prototype.unload = function unload() {
	var objects = this.getConnectedObjects();
	for (var k in objects) {
		RC.getContext().setUnload(objects[k]);
	}
};


/**
 * Creates a flat hash of all game objects that are "contained" in this
 * player (bags, items, DCs, quests), including the player object
 * itself.
 *
 * @returns {object} an object with TSIDs as prop names and {@link
 *          GameObject} instances as properties
 * @private
 */
Player.prototype.getConnectedObjects = function getConnectedObjects() {
	// collect objects in a hash (object with TSIDs as property names) to
	// implicitly avoid duplicate entries
	var ret = {};
	// get all bags and items
	var inventory = this.getAllItems();
	for (var k in inventory) {
		ret[inventory[k].tsid] = inventory[k];
	}
	// get all DCs and quests
	var hashes = [this, this.jobs, this.friends];
	if (this.quests) {
		hashes.push(this.quests);
		if (this.quests.todo) hashes.push(this.quests.todo.quests);
		if (this.quests.done) hashes.push(this.quests.done.quests);
		if (this.quests.fail_repeat) hashes.push(this.quests.fail_repeat.quests);
		if (this.quests.misc) hashes.push(this.quests.misc.quests);
	}
	hashes.forEach(function collectDCs(hash) {
		if (typeof hash !== 'object') return;  // guard against uninitialized structures
		Object.keys(hash).forEach(function iter(k) {
			var prop = hash[k];
			if (typeof prop === 'object' && (utils.isDC(prop) || utils.isQuest(prop))) {
				ret[prop.tsid] = prop;
			}
		});
	});
	// add player itself
	ret[this.tsid] = this;
	return ret;
	// Yes, this function contains way too much game specific knowledge about
	// the GSJS player data. A more generic solution would be preferable.
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
Player.prototype.startMove = function startMove(newLoc, x, y) {
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
Player.prototype.endMove = function endMove() {
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


/**
 * Prepares the player for moving to another game server if the given
 * location is not managed by this server (if it is, this function does
 * nothing). This includes sending the relevant server messages to the
 * client.
 *
 * @param {string} newLocId TSID of the location the player is moving to
 */
Player.prototype.gsMoveCheck = function gsMoveCheck(newLocId) {
	if (rpc.isLocal(newLocId)) {
		log.debug('local move, no GS change');
		return;
	}
	var gsConf = config.getGSConf(rpc.getGsid(newLocId));
	var token = auth.getToken(this);
	log.info('scheduling GS move to %s', gsConf.gsid);
	// send GSJS inter-GS move event
	this.onGSLogout();
	// inform client about pending reconnect
	this.sendServerMsg('PREPARE_TO_RECONNECT', {
		hostport: gsConf.hostPort,
		token: token,
	});
	// set up callback that will tell the client to reconnect to the new GS
	// once the current request is finished
	var self = this;
	RC.getContext().setPostPersCallback(function triggerReconnect() {
		self.sendServerMsg('CLOSE', {msg: 'CONNECT_TO_ANOTHER_SERVER'});
	});
	return gsConf;
};



/**
 * Sends a special "server message" to the player's client, mostly for
 * connection management (e.g. reconnect information during inter-GS
 * moves, server restarts etc.).
 *
 * @param {string} action indicates the purpose of the message (must be
 *        `CLOSE`, `TOKEN` or `PREPARE_TO_RECONNECT`)
 * @param {object} [data] optional additional payload data
 */
Player.prototype.sendServerMsg = function sendServerMsg(action, data) {
	assert(this.session !== undefined && this.session !== null,
		'tried to send to offline player');
	var msg = data || {};
	msg.type = 'server_message';
	msg.action = action;
	log.debug({payload: msg}, 'sending server message');
	this.session.send(msg);
};
