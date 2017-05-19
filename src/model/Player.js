'use strict';

module.exports = Player;


var _ = require('lodash');
var assert = require('assert');
var auth = require('comm/auth');
var config = require('config');
var Prop = require('model/Property');
var Bag = require('model/Bag');
var pers = require('data/pers');
var rpc = require('data/rpc');
var RQ = require('data/RequestQueue');
var util = require('util');
var utils = require('utils');


util.inherits(Player, Bag);
Player.prototype.TSID_INITIAL = 'P';


// the JSON data in persistence does not contain specific class information for
// object-type values, so we need a list of things that are of type 'Property'
var PROPS = {
	metabolics: {
		energy: 'property',
		mood: 'property',
	},
	stats: {
		xp: 'property',
		currants: 'property',
		donation_xp_today: 'property',
		imagination: 'property',
		credits: 'property',
		quoins_today: 'property',
		meditation_today: 'property',
		rube_trades: 'property',
		rube_lure_disabled: 'property',
		recipe_xp_today: 'object',
	},
	daily_favor: {
		alph: 'property',
		cosma: 'property',
		friendly: 'property',
		grendaline: 'property',
		humbaba: 'property',
		lem: 'property',
		mab: 'property',
		pot: 'property',
		spriggan: 'property',
		ti: 'property',
		zille: 'property',
	},
	favor_points: {
		alph: 'property',
		cosma: 'property',
		friendly: 'property',
		grendaline: 'property',
		humbaba: 'property',
		lem: 'property',
		mab: 'property',
		pot: 'property',
		spriggan: 'property',
		ti: 'property',
		zille: 'property',
	},
	giant_emblems: {
		alph: 'property',
		cosma: 'property',
		friendly: 'property',
		grendaline: 'property',
		humbaba: 'property',
		lem: 'property',
		mab: 'property',
		pot: 'property',
		spriggan: 'property',
		ti: 'property',
		zille: 'property',
	},
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
	utils.addNonEnumerable(this, 'msgCache', []);
	// convert selected properties to "Property" instances (works with simple
	// int values as well as serialized Property instances)
	for (var group in PROPS) {
		if (!this[group]) this[group] = {};
		for (var key in PROPS[group]) {
			if (PROPS[group][key] === 'property') {
				this[group][key] = new Prop(key, this[group][key]);
			}
			else if (PROPS[group][key] === 'object') {
				if (!this[group][key]) {
					this[group][key] = {};
				}
				for (var subkey in this[group][key]) {
					var propGroup = this[group][key];
					propGroup[subkey] = new Prop(subkey, propGroup[subkey]);
				}
			}
		}
	}
}

utils.copyProps(require('model/PlayerApi').prototype, Player.prototype);


/**
 * Creates a new `Player` instance and adds it to persistence.
 *
 * @param {object} [data] player data; must contain everything required
 *        for a new player
 * @returns {object} a `Player` object
 */
Player.create = function create(data) {
	assert(_.isObject(data), 'minimal player data set required');
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
 * Creates a processed shallow copy of this player instance for serialization.
 *
 * @returns {object} shallow copy of the player, prepared for serialization
 *
 * @see {@link GameObject#serialize|GameObject.serialize}
 */
Player.prototype.serialize = function serialize() {
	var ret = Player.super_.prototype.serialize.call(this);
	for (var group in PROPS) {
		if (!this[group]) {
			continue;
		}
		ret[group] = {};  // ret is just a shallow copy
		for (var key in PROPS[group]) {
			if (!this[group][key]) {
				continue;
			}
			else if (this[group][key] instanceof Prop) {
				ret[group][key] = this[group][key].serialize();
			}
			else if (_.isObject(this[group][key])) {
				ret[group][key] = {};
				for (var subkey in this[group][key]) {
					ret[group][key][subkey] = this[group][key][subkey].serialize();
				}
			}
		}
		// property groups have non-property members (e.g.
		// metabolics.tank), add those too
		for (key in this[group]) {
			if (!(key in ret[group])) ret[group][key] = this[group][key];
		}
	}
	return ret;
};


/**
 * Retrieves the request queue for this player (typically, the queue of the
 * location the player is currently in).
 *
 * @returns {RequestQueue} the request queue for this player
 */
Player.prototype.getRQ = function getRQ() {
	if (this.location && rpc.isLocal(this.location)) {
		return RQ.get(this.location);
	}
	return RQ.getGlobal();
};


/**
 * Initializes the instance for an active player; needs to be called first when
 * a client is actually logging in on this GS, to enable sending messages back
 * to the client.
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
		this.rqPush(this.onRelogin);
	}
	else {
		// not in RQ since GSJS code processing the login_start request relies
		// on the player being fully initialized, which may not always be the
		// case (e.g. players in fixtures not having their DCs etc. yet)
		this.onLogin();
		// clear stale instance group references, if any; this is a workaround
		// implemented with great self-loathing in order to lighten the player
		// support load, instead of fixing the underlying architecture issues :(
		pers.clearStaleRefs(this, 'instances.instances');
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
		this.cancelGsTimer('onPlayTimeCheck', false);
		this.cancelGsTimer('refreshToken', true);
		// remove from location, onExit callbacks etc.
		this.startMove();
		// GSJS logout event
		this.rqPush(this.onLogout);
		// let other clients in same location know we're gone
		this.location.send({
			type: 'pc_logout',
			pc: {tsid: this.tsid, label: this.label},
		}, false, this);
		// stop timers etc and unload from live object cache
		this.rqPush(this.unload);
	}
	// delete gs movement flag
	delete this.isMovingGs;
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
		if (!rpc.isLocal(newLoc)) {
			this.isMovingGs = true;
		}
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
	if (this.isMovingGs) {
		// catch up on cached messages
		delete this.isMovingGs;
		for (var i = 0; i < this.msgCache.length; i++) {
			this.send(this.msgCache[i]);
		}
		this.msgCache = [];
	}
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
	// set up next request that will tell the client to reconnect to the new GS
	var self = this;
	this.getRQ().push('unload', this.unload.bind(this),
		function triggerReconnect() {
			if (self.isConnected()) {
				// make sure remaining announcements are sent to client
				self.send({type: 'location_event'}, true, true);
				self.sendServerMsg('CLOSE', {msg: 'CONNECT_TO_ANOTHER_SERVER'});
				self.session = null;  // cut the cord
			}
		}, {waitPers: true, obj: this, session: this.session});
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
	var src = {
		x: item.x === 0 ? this.x : item.x,
		y: item.y === 0 ? this.y : item.y,
		cont: item.container,
	};
	for (var slot = fromSlot; slot <= toSlot && amount > 0; slot++) {
		var count = bag.addToSlot(item, slot, amount);
		amount -= count;
		if (count && src.cont !== this) {
			if (utils.isBag(src.cont) && !utils.isPlayer(src.cont)) {
				src.x = src.cont.x;
				src.y = src.cont.y;
			}
			var animSrc = (item.animSourceTsid === 'I-FAMILIAR' ? 'familiar_to_pack' :
				'floor_to_pack');
			var annc = {
				orig_x: src.x,
				orig_y: src.y,
				dest_path: this.tsid + '/' + bag.getSlot(slot).tsid + '/',
			};
			if (!utils.isPlayer(bag)) {
				annc.dest_path = this.tsid + '/' + bag.tsid + '/';
				annc.dest_slot = slot;
			}
			delete item.animSourceTsid;
			this.createStackAnim(animSrc, item.class_tsid, count, annc);
		}
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
	if (this.isMovingGs) {
		log.info('queueing message during gs move for player %s', this);
		this.msgCache.push(msg);
		return;
	}
	if (!this.session) {
		log.info('dropping message to offline player %s', this);
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
			msg = _.clone(msg);  // avoid modifying original message object
			msg.changes = changes;
		}
	}
	// append "announcements" segment
	if (this.anncs.length > 0) {
		if (skipChanges || !msg.changes) {  // only clone if it hasn't already been cloned
			msg = _.clone(msg);
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
		for (var key in PROPS[group]) {
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
		var it;
		for (var k in this.location.items) {
			it = this.location.items[k];
			if (!it || !it.collDet) continue;
			// test default hitbox of this item
			this.handleCollision(it, it.hitBox);
			// test all named hitboxes of this item
			for (var b in it.hitBoxes) {
				this.handleCollision(it, it.hitBoxes[b], b);
			}
		}
		for (var l in this.location.players) {
			it = this.location.players[l];
			if (!it || !it.collDet || it.tsid === this.tsid ||
				!it.hasPlayerCollisions()) continue;
			// test default hitbox of this player
			this.handleCollision(it, {w: it.w * it.stacked_physics_cache.pc_scale,
				h: it.h * it.stacked_physics_cache.pc_scale});
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
 * @param {Item|Player|object} it item or player to check for collisions,
 *        or a location hitbox (must have at least `x` and `y` properties)
 * @param {object} [hitBox] hitbox to test (must have `w` and `h`
 *        properties); if `undefined`, the default 60*60px hitbox
 *        configuration is assumed
 * @param {string} [hitBoxName] ID of the hitbox to test; mandatory for
 *        location hitboxes, in case of items or players `undefined` indicates
 *        the item's or player's default (unnamed) hitbox
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
				this.location.rqPush(this.location.hitBox, this, hitBoxName, hit);
				// "abuse" player's colliders list to keep track of location
				// hitboxes we're in
				this['!colliders'][hitBoxName] = t;
			}
		}
		else if (hitBoxName || !it['!colliders'][this.tsid]) {
			// if we just entered a named hitbox, an item's default hitbox or a
			// player's default hitbox
			log.trace('%s entered/inside hitbox "%s" of %s', this, hitBoxName, it);
			// call item's or player's collision handler
			it.rqPush(it.onPlayerCollision, this, hitBoxName);
			// keep track of player in the item's or player's hitbox
			if (!hitBoxName) {
				it['!colliders'][this.tsid] = t;
			}
		}
	}
	else if (!it.onPlayerCollision) {
		// if we're leaving a location hitbox
		if (this['!colliders'][hitBoxName]) {
			log.trace('%s left location hitbox "%s"', this, hitBoxName);
			// remove this hitbox from the player's list of hitboxes
			delete this['!colliders'][hitBoxName];
			// call the handler for leaving the hitbox (if any)
			if (this.location.onLeavingHitBox) {
				this.location.rqPush(this.location.onLeavingHitBox, this, hitBoxName);
			}
		}
	}
	else if (it['!colliders'][this.tsid] && !hitBoxName) {
		// if we're leaving a default hitbox
		log.trace('%s left hitbox of %s', this, it);
		// remove the player from the list of hitboxes
		delete it['!colliders'][this.tsid];
		// call the handler for leaving the item's hitbox (if any)
		if (it.onPlayerLeavingCollisionArea) {
			it.rqPush(it.onPlayerLeavingCollisionArea, this);
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
	// the x/y properties of items (and players) always indicate the center of
	// their bottom edge
	var xDist = Math.abs(this.x - it.x);
	// calculate y distance based on vertical center of player/item hitbox
	// the y axis is reversed in the in-game coordinate system (i.e. negative
	// values go upward)
	var yDist = Math.abs(this.y - pcHeight / 2 - (it.y - hitBox.h / 2));
	// return true if the two hitboxes overlap
	return xDist < (hitBox.w + pcWidth) / 2 && yDist < (hitBox.h + pcHeight) / 2;
};


/**
 * Creates and queues an announcement that makes item transfer
 * animations on the players client.
 *
 * @param {string} type the stack animation type to send
 * @param {string} classTsid the item to show the player
 * @param {number} count the number of items moved
 * @param {object} info additional data for the announcement (properties are
 *                 shallow-copied into the generated announcement)
 */
Player.prototype.createStackAnim = function createStackAnim(type, classTsid,
	count, info) {
	var annc = {
		type: type,
		item_class: classTsid,
		count: count,
	};
	for (var key in info) {
		annc[key] = info[key];
	}
	this.queueAnnc(annc);
};
