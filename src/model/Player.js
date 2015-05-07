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
var lodash = require('lodash');
var DummyError = require('errors').DummyError;


util.inherits(Player, Bag);
Player.prototype.TSID_INITIAL = 'P';


// the JSON data in persistence does not contain specific class information for
// object-type values, so we need a list of things that are of type 'Property'
var PROPS = {
	metabolics: ['energy', 'mood'],
	stats: [
		'xp', 'currants', 'donation_xp_today', 'imagination', 'credits',
		'quoins_today', 'meditation_today', 'rube_trades', 'rube_lure_disabled',
		'recipe_xp_today'],
	daily_favor: [
		'alph', 'cosma', 'friendly', 'grendaline', 'humbaba', 'lem', 'mab',
		'pot', 'spriggan', 'ti', 'zille'],
	favor_points: [
		'alph', 'cosma', 'friendly', 'grendaline', 'humbaba', 'lem', 'mab',
		'pot', 'spriggan', 'ti', 'zille'],
	giant_emblems: [
		'alph', 'cosma', 'friendly', 'grendaline', 'humbaba', 'lem', 'mab',
		'pot', 'spriggan', 'ti', 'zille'],
};
// indicates which of the above PROPS will be included in the 'changes' segment
// of outgoing messages (i.e. value updates sent to the client)
var PROPS_CHANGES = {
	metabolics: true,
	daily_favor: true,
	stats: {
		xp: true, currants: true, imagination: true, credits: true,
		quoins_today: true, meditation_today: true,
	},
};


/**
 * Generic constructor for both instantiating an existing game
 * character (from JSON data), as well as creating a new one.
 *
 * @param {object} [data] initialization values (properties are
 *        shallow-copied into the instance)
 * @constructor
 * @augments Bag
 * @mixes PlayerApi
 */
function Player(data) {
	Player.super_.call(this, data);
	utils.addNonEnumerable(this, 'session');
	utils.addNonEnumerable(this, 'active', false);
	utils.addNonEnumerable(this, 'changes', []);
	utils.addNonEnumerable(this, 'anncs', []);
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

utils.copyProps(require('model/PlayerApi').prototype, Player.prototype);


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
	assert(utils.isLoc(data.location), 'location required');
	data.class_tsid = data.class_tsid || 'human';
	var ret = pers.create(Player, data);
	log.info('%s was imagined!', ret);
	return ret;
};


/**
 * Just overridden to prevent accidentally or maliciously deleting
 * players.
 * @private
 */
Player.prototype.del = function del() {
	throw new Error('Bad kitty!');
};


/**
 * Creates a processed shallow copy of this player instance for
 * serialization.
 *
 * @see {@link GameObject#serialize|GameObject.serialize}
 */
Player.prototype.serialize = function serialize() {
	var ret = Player.super_.prototype.serialize.call(this);
	for (var group in PROPS) {
		if (this[group]) {
			ret[group] = {};  // ret is just a shallow copy
			var key;
			for (var i = 0; i < PROPS[group].length; i++) {
				key = PROPS[group][i];
				if (this[group][key]) {
					ret[group][key] = this[group][key].serialize();
				}
			}
			// property groups have non-property members (e.g.
			// metabolics.tank), add those too
			for (key in this[group]) {
				if (!(key in ret[group])) ret[group][key] = this[group][key];
			}
		}
	}
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
	this.resumeGsTimers();
	if (!this.gsTimerExists('onTimePlaying', true)) {
		this.setGsTimer({fname: 'onTimePlaying', delay: 60000, interval: true,
			noCatchUp: true});
	}
	if (isRelogin) {
		this.onRelogin();
	}
	else {
		this.onLogin();
	}
	if (auth.getTokenLifespan() > 0) {
		this.setGsTimer({fname: 'refreshToken', interval: true, internal: true,
			delay: Math.ceil(auth.getTokenLifespan() * 0.9 * 1000)});
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
		// clear intervals
		this.cancelGsTimer('onTimePlaying', true);
		this.cancelGsTimer('refreshToken', true);
		// remove from location, onExit callbacks etc.
		this.startMove();
		// GSJS logout event
		this.onLogout();
		// let other clients in same location know we're gone
		this.location.send({
			type: 'pc_logout',
			pc: {tsid: this.tsid, label: this.label},
		}, false, this);
	}
	// in any case, stop timers etc and unload from live object cache
	this.unload();
	// unlink the session, so this function won't be accidentally called again
	this.session = null;
};


/**
 * Sends a server message with an updated authentication token to the
 * player's client. Called automatically at regular intervals (set up
 * in {@link Player#onLoginStart}).
 *
 * @private
 */
Player.prototype.refreshToken = function refreshToken() {
	var token = auth.getToken(this);
	log.debug({token: token}, 'refreshing auth token');
	this.sendServerMsg('TOKEN', {msg: token});
};


/**
 * Checks if a client is currently connected to the GS for this player.
 *
 * @returns {boolean} `true` if the player is currently online
 */
Player.prototype.isConnected = function isConnected() {
	return this.session !== undefined && this.session !== null;
};


/**
 * Removes the player and all related objects (inventory items, DCs,
 * quests etc) from the GS live object cache (or more specifically,
 * schedules their removal at the end of the current request).
 */
Player.prototype.unload = function unload() {
	log.debug('%s.unload', this);
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
	var inventory = this.getAllItems(true, false);
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
 * Resumes timers/intervals (only if the player is actually connected).
 */
Player.prototype.resumeGsTimers = function resumeGsTimers() {
	if (!this.isConnected()) {
		log.debug('not resuming timers/intervals for offline player %s', this);
	}
	else {
		Player.super_.prototype.resumeGsTimers.call(this);
	}
};


/**
 * Initiates a location move for this player. Removes the player from
 * the current location, and updates the `location` property with the
 * new location. The player is *not* added to the list of players in
 * the new location yet.
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
		this.location.removePlayer(this, newLoc);
	}
	if (newLoc) {
		// update location and position
		this.location = newLoc;
		this.setXY(x, y, true);
	}
	this.active = false;
};


/**
 * Finishes a location move for this player by adding the player to the
 * list of active players in the new location. The `location` property
 * already needs to point to the "new" location at this point (set in
 * {@link Player#startMove|startMove}).
 */
Player.prototype.endMove = function endMove() {
	log.info('end move to %s', this.location);
	assert(utils.isLoc(this.location), util.format(
		'invalid location property: %s', this.location));
	this.active = true;
	this.location.addPlayer(this);
};


/**
 * Prepares the player for moving to another game server if the given
 * location is not managed by this server (if it is, this function does
 * nothing). This includes sending the relevant server messages to the
 * client.
 *
 * @param {string} newLocId TSID of the location the player is moving to
 * @returns {object|undefined} a game server configuration record (see
 *          {@link module:config~getGSConf|getGSConf}) with an added
 *          `token` element, or `undefined` if the new location is on
 *          the same GS as the current one
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
		if (self.isConnected()) {
			self.sendServerMsg('CLOSE', {msg: 'CONNECT_TO_ANOTHER_SERVER'});
		}
	});
	var ret = utils.shallowCopy(gsConf);
	ret.token = token;
	return ret;
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
	assert(this.isConnected(), 'trying to send message to offline player ' + this);
	var msg = data || {};
	msg.type = 'server_message';
	msg.action = action;
	log.debug({payload: msg}, 'sending server message');
	this.session.send(msg);
};


/**
 * Distribute (part of) an item stack into a range of inventory slots
 * of either the player itself, or one of its bags, using empty slots
 * or merging with existing items.
 *
 * @param {Item} item item stack to add; may be deleted in the process
 * @param {number} fromSlot distribution starts at this slot number
 * @param {number} toSlot distribution ends at this slot number
 *        (inclusive; must be >= `fromSlot`)
 * @param {string|null} path path to target bag; if `null`, the player
 *        inventory is targeted
 * @param {number} [amount] amount of the item stack to add/distribute;
 *        if not specified, the whole stack is processed
 * @returns {number} amount of remaining items (i.e. that could not be
 *          distributed)
 */
Player.prototype.addToAnySlot = function addToAnySlot(item, fromSlot, toSlot,
	path, amount) {
	if (amount === undefined || amount > item.count) amount = item.count;
	var bag = path ? pers.get(path.split('/').pop()) : this;
	for (var slot = fromSlot; slot <= toSlot && amount > 0; slot++) {
		amount -= bag.addToSlot(item, slot, amount);
	}
	return amount;
};


/**
 * Creates a change data record for the given item and queues it to be
 * sent with the next message to the client. For container changes,
 * this must be called *before* the `tcont` property is changed (to the
 * new container TSID) in order to queue the change representing the
 * removal of the item from the previous container, and then again
 * *afterwards* for the addition to the new container.
 *
 * @param {Item} item the changed/changing item
 * @param {boolean} [removed] if `true`, queues a *removal* change
 * @param {boolean} [compact] if `true`, queues a *short* change record
 *        (only coordinates and state, for NPC movement)
 */
Player.prototype.queueChanges = function queueChanges(item, removed, compact) {
	if (!this.session) return;  // don't queue changes for offline players
	log.trace('generating changes for %s%s', item, removed ? ' (removed)' : '');
	if (item.only_visible_to && item.only_visible_to !== this.tsid) {
		log.trace('%s not visible for %s, skipping', item, this);
		return;
	}
	var pcChanges = {};
	var locChanges = {};
	if (item.tcont === this.tsid) {
		pcChanges[item.tsid] = item.getChangeData(this, removed, compact);
	}
	else if (item.tcont === this.location.tsid) {
		locChanges[item.tsid] = item.getChangeData(this, removed, compact);
	}
	var changes = {
		location_tsid: this.location.tsid,
		itemstack_values: {
			pc: pcChanges,
			location: locChanges,
		},
	};
	log.trace({changes: changes}, 'queueing changes for %s', item);
	this.changes.push(changes);
};


/**
 * Adds an announcement to the queue of announcements to be sent to the
 * client with the next outgoing message.
 *
 * @param {object} annc announcement data
 */
Player.prototype.queueAnnc = function queueAnnc(annc) {
	if (!this.session) return;  // don't queue announcements for offline players
	log.trace({annc: annc}, 'queueing annc');
	this.anncs.push(annc);
};


/**
 * Sends a message to the player's client, including queued
 * announcements, property and item changes.
 *
 * @param {object} msg the message to send; must not contain anything
 *        that cannot be encoded in AMF3 (e.g. circular references)
 * @param {boolean} [skipChanges] if `true`, queued property and item
 *        changes are **not** included
 * @param {boolean} [flushOnly] if `true`, the message is only sent if
 *        there are changes and/or announcements to send along with it
 */
Player.prototype.send = function send(msg, skipChanges, flushOnly) {
	if (!this.session) {
		log.info(new DummyError(),
			'trying to send message to offline player %s', this);
		return;
	}
	// generage "changes" segment
	if (!skipChanges) {
		var changes = this.mergeChanges();
		var propChanges = this.getPropChanges();
		if (propChanges) {
			changes = changes || {};
			changes.stat_values = propChanges;
		}
		if (changes) {
			msg = lodash.clone(msg);  // avoid modifying original message object
			msg.changes = changes;
		}
	}
	// append "announcements" segment
	if (this.anncs.length > 0) {
		if (skipChanges || !msg.changes) {  // only clone if it hasn't already been cloned
			msg = lodash.clone(msg);
		}
		msg.announcements = this.anncs;
		this.anncs = [];
	}
	if (!flushOnly || msg.changes || msg.announcements) {
		this.session.send(msg);
	}
};


/**
 * Merges the currently queued item changes into a single object,
 * suitable for the `changes` segment of an outgoing message.
 * Changes for items in a location are only included if they refer to
 * the player's current location. If multiple changes for the same item
 * are queued, the last one "wins".
 *
 * @returns {object|undefined} a record of item changes ready to be
 *          included in the next message sent to the client, or
 *          `undefined` when no changes are queued
 */
Player.prototype.mergeChanges = function mergeChanges() {
	var ret;
	while (this.changes.length > 0) {
		ret = ret || {
			location_tsid: this.location.tsid,
			itemstack_values: {
				pc: {},
				location: {},
			},
		};
		var c = this.changes.shift();
		var k;
		for (k in c.itemstack_values.pc) {
			ret.itemstack_values.pc[k] = c.itemstack_values.pc[k];
		}
		if (c.location_tsid === this.location.tsid) {
			for (k in c.itemstack_values.location) {
				ret.itemstack_values.location[k] = c.itemstack_values.location[k];
			}
		}
	}
	return ret;
};


/**
 * Combines the current values of the player's properties (that is,
 * `Property` instances like `metabolics.energy`, `stats.xp` etc.) into
 * an object suitable for inclusion in the `changes` segment of an
 * outgoing message to the client.
 * Only a specific, fixed subset of the available properties are
 * included (and among those, only the ones that changed since the last
 * message).
 *
 * @returns {object} an object containing property values, e.g.
 *          ```{energy: 60, xp: 555, alph: 12}```
 */
Player.prototype.getPropChanges = function getPropChanges() {
	var ret;
	for (var group in PROPS) {
		if (!this[group] || !PROPS_CHANGES[group]) continue;
		for (var i = 0; i < PROPS[group].length; i++) {
			var key = PROPS[group][i];
			var send = PROPS_CHANGES[group] === true || PROPS_CHANGES[group][key];
			var prop = this[group][key];
			if (send && prop && prop.changed) {
				ret = ret || {};
				ret[prop.label] = prop.value;
				prop.changed = false;
			}
		}
	}
	return ret;
};


/**
 * Override setXY of `Item` to handle collision detection
 *
 * @param {number} x new horizontal coordinate
 * @param {number} y new vertical coordinate
 * @param {boolean} [noCD] `true` to skip collision detection
 * @returns {boolean} `true` if the player's coordinates actually
 *          changed
 */
Player.prototype.setXY = function setXY(x, y, noCD) {
	// ignore if the player is currently moving between locations
	if (!this.active) return;
	// call setXY of Item to actually move the player (respecting physics/platforms)
	var actuallyMoved = Player.super_.prototype.setXY.call(this, x, y);
	// if the player actually moved we may have to handle a collision
	if (actuallyMoved && !noCD) {
		for (var k in this.location.items) {
			var it = this.location.items[k];
			if (!it || !it.collDet) continue;
			// test default hitbox of this item
			this.handleCollision(it, it.hitBox);
			// test all named hitboxes of this item
			for (var b in it.hitBoxes) {
				this.handleCollision(it, it.hitBoxes[b], b);
			}
		}
		if (this.active) {  // if we haven't been teleported away yet
			// test all hitboxes defined in the geometry of the current location
			var hitBoxes = this.location.geometry.getHitBoxes();
			for (var j in hitBoxes) {
				var box = hitBoxes[j];
				this.handleCollision(box, box, box.id);
			}
		}
	}
	return actuallyMoved;
};


/**
 * Collision detection handler for collision-enabled items and location
 * hitboxes.
 *
 * @param {Item|object} it item to check for collisions, or a location
 *        hitbox (must have at least `x` and `y` properties)
 * @param {object} [hitBox] hitbox to test (must have `w` and `h`
 *        properties); if `undefined`, the default 60*60px hitbox
 *        configuration is assumed
 * @param {string} [hitBoxName] ID of the hitbox to test; mandatory for
 *        location hitboxes, in case of items `undefined` indicates the
 *        item's default (unnamed) hitbox
 */
Player.prototype.handleCollision = function handleCollision(it, hitBox, hitBoxName) {
	if (!hitBox) hitBox = {w: 60, h: 60};  // default radius 60px

	var hit = this.isHit(it, hitBox);

	if (hit) {
		var t = Math.round(new Date().getTime() / 1000);
		if (!it.onPlayerCollision) {
			// if we just entered a location hitbox
			if (!this['!colliders'][hitBoxName]) {
				log.trace('%s entered location hitbox "%s"', this, hitBoxName);
				// call the handler for this hitbox
				this.location.hitBox(this, hitBoxName, hit);
				// "abuse" player's colliders list to keep track of location hitboxes we're in
				this['!colliders'][hitBoxName] = t;
			}
		}
		else {
			// if we just entered a named hitbox or an item's default hitbox
			if (hitBoxName || !it['!colliders'][this.tsid]) {
				log.trace('%s entered/inside hitbox "%s" of %s', this, hitBoxName, it);
				// call item's collision handler
				it.onPlayerCollision(this, hitBoxName);
				// keep track of player in the item's hitbox
				if (!hitBoxName) {
					it['!colliders'][this.tsid] = t;
				}
			}
		}
	}
	else {
		if (!it.onPlayerCollision) {
			// if we're leaving a location hitbox
			if (this['!colliders'][hitBoxName]) {
				log.trace('%s left location hitbox "%s"', this, hitBoxName);
				// remove this hitbox from the player's list of hitboxes
				delete this['!colliders'][hitBoxName];
				// call the handler for leaving the hitbox (if any)
				if (this.location.onLeavingHitBox) {
					this.location.onLeavingHitBox(this, hitBoxName);
				}
			}
		}
		// if we're leaving a default hitbox
		else if (it['!colliders'][this.tsid] && !hitBoxName) {
			log.trace('%s left hitbox of %s', this, it);
			// remove the player from the list of hitboxes
			delete it['!colliders'][this.tsid];
			// call the handler for leaving the item's hitbox (if any)
			if (it.onPlayerLeavingCollisionArea) {
				it.onPlayerLeavingCollisionArea(this);
			}
		}
	}
};


/**
 * Helper function used by handleCollision to determine whether a hit
 * occurred, i.e. whether the player's "hitbox" (its width/height
 * rectangle) and an item's "hitbox" overlap.
 *
 * @param {Item|object} it item to check for collisions, or a location
 *        hitbox (must have at least `x` and `y` properties)
 * @param {object} [hitBox] hitbox to test (must have `w` and `h`
 *        properties)
 * @private
 */
Player.prototype.isHit = function isHit(it, hitBox) {
	// respect the player's current scale factor
	var pcHeight = this.h * this.stacked_physics_cache.pc_scale;
	var pcWidth = this.w * this.stacked_physics_cache.pc_scale;
	// the x/y properties of items (and players) always indicate the center of their bottom edge
	var xDist = Math.abs(this.x - it.x);
	// calculate y distance based on vertical center of player/item hitbox
	// the y axis is reversed in the in-game coordinate system (i.e. negative values go upward)
	var yDist = Math.abs((this.y - pcHeight / 2) - (it.y - hitBox.h / 2));
	// return true if the two hitboxes overlap
	return xDist < (hitBox.w + pcWidth) / 2 && yDist < (hitBox.h + pcHeight) / 2;
};
