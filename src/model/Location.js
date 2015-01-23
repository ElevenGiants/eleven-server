'use strict';

module.exports = Location;


var assert = require('assert');
var config = require('config');
var GameObject = require('model/GameObject');
var Geo = require('model/Geo');
var Bag = require('model/Bag');
var IdObjRefMap = require('model/IdObjRefMap');
var OrderedHash = require('model/OrderedHash');
var pers = require('data/pers');
var RC = require('data/RequestContext');
var rpc = require('data/rpc');
var util = require('util');
var utils = require('utils');


util.inherits(Location, GameObject);
Location.prototype.TSID_INITIAL = 'L';


/**
 * Generic constructor for both instantiating an existing location
 * (from JSON data), and creating a new location.
 *
 * @param {object} [data] initialization values (properties are
 *        shallow-copied into the location object)
 * @param {Geo} [geo] geometry data (optional, for testing); if
 *        `undefined`, the respective `Geo` object is loaded from
 *        persistence
 * @constructor
 * @augments GameObject
 * @mixes LocationApi
 */
function Location(data, geo) {
	data = data || {};
	if (!data.tsid) {
		if (geo) {
			data.tsid = geo.getLocTsid();
		}
		else {
			data.tsid = rpc.makeLocalTsid(Location.prototype.TSID_INITIAL);
		}
	}
	Location.super_.call(this, data);
	// initialize items and players, convert to IdObjRefMap
	if (!this.players || this.players instanceof Array) {
		this.players = utils.arrayToHash(this.players);
	}
	this.players = new IdObjRefMap(this.players);
	if (!this.items || this.items instanceof Array) {
		this.items = utils.arrayToHash(this.items);
	}
	this.items = new IdObjRefMap(this.items);
	// convert neighbor list to OrderedHash
	if (this.neighbors) {
		this.neighbors = new OrderedHash(this.neighbors);
	}
	// initialize geometry
	utils.addNonEnumerable(this, 'geometry');
	utils.addNonEnumerable(this, 'clientGeometry');
	utils.addNonEnumerable(this, 'geo');
	var geoData = geo || pers.get(this.getGeoTsid(), true);
	assert(typeof geoData === 'object', 'no geometry data for ' + this);
	this.updateGeo(geoData);
	// periodically check whether location can be released from memory
	var unloadInt = config.get('pers:locUnloadInt', null);
	if (unloadInt && rpc.isLocal(this)) {
		this.setGsTimer({fname: 'checkUnload', delay: unloadInt, interval: true,
			internal: true});
	}
}

utils.copyProps(require('model/LocationApi').prototype, Location.prototype);


// dummy property just so we can more easily "inherit" some functions from Bag
Object.defineProperty(Location.prototype, 'hiddenItems', {
	get: function get() {
		return {};
	},
});


// define activePlayers property as read-only alias for players
Object.defineProperty(Location.prototype, 'activePlayers', {
	get: function get() {
		return this.players;
	},
});


/**
 * Creates a new `Location` instance and adds it to persistence.
 *
 * @param {Geo} geo geometry data (location TSID will be derived from
 *        `geo.tsid`)
 * @param {object} [data] additional properties
 * @returns {object} a `Location` instance wrapped in a {@link
 * module:data/persProxy|persistence proxy}
 */
Location.create = function create(geo, data) {
	data = data || {};
	data.tsid = geo.getLocTsid();
	data.class_tsid = data.class_tsid || 'town';
	return pers.create(Location, data);
};


/**
 * Schedules this location, its geometry object and all items in it for
 * deletion after the current request.
 */
Location.prototype.del = function del() {
	assert(Object.keys(this.players).length === 0, 'there are people here!');
	for (var k in this.items) {
		this.items[k].del();
	}
	this.geometry.del();
	Location.super_.prototype.del.call(this);
};


/**
 * Adds a player to the list of players in this location and calls
 * various GSJS "onEnter" event handlers.
 *
 * @param {Player} player the player to add
 */
Location.prototype.addPlayer = function addPlayer(player) {
	this.players[player.tsid] = player;
	if (this.onPlayerEnter) {
		this.onPlayerEnter(player);
	}
	for (var k in this.items) {
		var it = this.items[k];
		if (it.onPlayerEnter) {
			try {
				it.onPlayerEnter(player);
			}
			catch (e) {
				log.error(e, 'error in %s.onPlayerEnter handler', it);
			}
		}
	}
};


/**
 * Removes a player from the list of players in this location and
 * calls various GSJS "onExit" event handlers. If after that the
 * location is empty (no other players remaining), it is unloaded
 * from memory (including everything in it).
 *
 * @param {Player} player the player to remove
 * @param {Location} [newLoc] the location the player is moving to
 *        (`undefined` during logout)
 */
Location.prototype.removePlayer = function removePlayer(player, newLoc) {
	delete this.players[player.tsid];
	if (this.onPlayerExit) {
		this.onPlayerExit(player, newLoc);
	}
	for (var k in this.items) {
		var it = this.items[k];
		if (it.onPlayerExit) {
			try {
				it.onPlayerExit(player);
			}
			catch (e) {
				log.error(e, 'error in %s.onPlayerExit handler', it);
			}
		}
	}
};


/**
 * Checks whether it is possible to unload the location, and does so
 * if it is (called by an interval set up in the constructor).
 * @private
 */
Location.prototype.checkUnload = function checkUnload() {
	// trivial heuristic for now - may become more complex in the future
	// (e.g. minimum empty period before unloading)
	if (this.players.length === 0) {
		this.unload();
	}
};


/**
 * Schedules the location (including geometry) and all contained items
 * for removal from memory at the end of the current request.
 */
Location.prototype.unload = function unload() {
	log.info('%s.unload', this);
	var rc = RC.getContext();
	var items = this.getAllItems();
	for (var k in items) {
		rc.setUnload(items[k]);
	}
	rc.setUnload(this.geometry);
	rc.setUnload(this);
};


/**
 * Gets the TSID of the {@link Geo} object for this location.
 *
 * @returns {string} TSID of the corresponding {@link Geo} object
 */
Location.prototype.getGeoTsid = function getGeoTsid() {
	return Geo.prototype.TSID_INITIAL + this.tsid.slice(1);
};


/**
 * Creates a processed shallow copy of this location, prepared for
 * serialization.
 *
 * @see {@link GameObject#serialize|GameObject.serialize}
 */
Location.prototype.serialize = function serialize() {
	var ret = Location.super_.prototype.serialize.call(this);
	ret.items = utils.hashToArray(ret.items);
	ret.players = utils.hashToArray(ret.players);
	return ret;
};


/**
 * (Re)initializes the geometry data (see {@link Geo#prepConnects})
 * and updates the `clientGeometry` and `geo` properties. Should be
 * called after any geometry change.
 *
 * @param {Geo} [data] new/changed geometry data; if `undefined`,
 *        operates on the existing `Geo` object
 */
Location.prototype.updateGeo = function updateGeo(data) {
	log.debug('%s.updateGeo', this);
	// optional parameter handling
	if (!data) data = this.geometry;
	this.geometry = data;
	// workaround for GSJS functions that replace the whole geometry property
	if (!(this.geometry instanceof Geo)) {
		this.geometry.tsid = this.getGeoTsid();  // make sure new data does not have a template TSID
		this.geometry = Geo.create(this.geometry);
	}
	// process connects for GSJS
	this.geometry.prepConnects();
	// initialize/update clientGeometry and geo properties
	this.clientGeometry = this.geometry.getClientGeo(this);
	this.geo = this.geometry.getGeo();
};


/**
 * Creates a change data record for the given item and queues it to be
 * sent with the next outgoing message to each client of a player in
 * the location. See {@link Player#queueChanges} for details.
 *
 * @param {Item} item the changed/changing item
 * @param {boolean} [removed] if `true`, queues a *removal* change
 * @param {boolean} [compact] if `true`, queues a *short* change record
 *        (only coordinates and state, for NPC movement)
 */
Location.prototype.queueChanges = function queueChanges(item, removed, compact) {
	for (var tsid in this.players) {
		this.players[tsid].queueChanges(item, removed, compact);
	}
};


/**
 * Adds an announcement to the announcements queue for all players in
 * the location.
 *
 * @param {object} annc announcement data
 * @param {Player} [skipPlayer] announcement is **not** queued for this
 *        player
 */
Location.prototype.queueAnnc = function queueAnnc(annc, skipPlayer) {
	for (var tsid in this.players) {
		if (!skipPlayer || tsid !== skipPlayer.tsid) {
			this.players[tsid].queueAnnc(annc);
		}
	}
};


/**
 * Sends a message to all players in this location (except those in the
 * optional exclusion parameter).
 *
 * @param {object} msg the message to send; must not contain anything
 *        that cannot be encoded in AMF3 (e.g. circular references)
 * @param {boolean} [skipChanges] if `true`, queued property and item
 *        changes are **not** included
 * @param {object|array|string|Player} exclude players **not** to send
 *        the message to; may be either a single `Player` instance or
 *        TSID, an object with player TSIDs as keys, or an array of
 *        TSIDs or `Player`s
 */
Location.prototype.send = function send(msg, skipChanges, exclude) {
	var excl = utils.playersArgToList(exclude);
	for (var tsid in this.players) {
		if (excl.indexOf(tsid) === -1) {
			var p = this.players[tsid];
			if (p.location && p.location.tsid !== this.tsid) {
				log.warn('removing stale player %s from %s', p, this);
				delete this.players[tsid];
			}
			else {
				p.send(msg, skipChanges);
			}
		}
	}
};


/**
 * Puts the item into the location at the given position, merging it
 * with existing nearby items of the same class.
 *
 * @param {Item} item the item to place
 * @param {number} x x coordinate of the item's position
 * @param {number} y y coordinate of the item's position
 * @param {boolean} [noMerge] if `true`, item will **not** be merged
 *        with other nearby items
 */
Location.prototype.addItem = function addItem(item, x, y, noMerge) {
	item.setContainer(this, x, y);
	//TODO: merging
};


/**
 * Recursively collects the items in this location, adding them to a
 * flat data structure with TSID "paths" as keys (see {@link
 * Bag#getAllItems} for an example).
 *
 * @returns {object} a hash with all items in the location
 */
Location.prototype.getAllItems = Bag.prototype.getAllItems;


/**
 * Gets a list of items of a particular type in this location.
 *
 * @param {string} classTsid item class ID to filter for
 * @returns {object} found matching items (with TSIDs as keys)
 */
Location.prototype.getClassItems = Bag.prototype.getClassItems;


/**
 * Retrieves an item in the location by path.
 *
 * @param {string} path a path string pointing to an item in this
 *        location (like "B1/B2/I3")
 * @returns {Item|null} the requested item, or `null` if not found
 */
Location.prototype.getPath = function getPath(path) {
	return this.getAllItems(true)[path] || null;
};


/**
 * Announces an item state change to all other items in the location.
 *
 * @param {Item} item the item whose state has changed
 */
Location.prototype.sendItemStateChange = function sendItemStateChange(item) {
	for (var k in this.items) {
		if (this.items[k] !== item && this.items[k].onContainerItemStateChanged) {
			this.items[k].onContainerItemStateChanged(item);
		}
	}
};


/**
 * Retrieves a list of items or players in a given radius around a
 * point in the location. Optionally returns the results in an array
 * sorted by distance.
 *
 * @param {number} x x coordinate to search around
 * @param {number} y y coordinate to search around
 * @param {number} r radius to consider (in px)
 * @param {boolean} [players] if `true`, find players (items otherwise)
 * @param {boolean} [sort] sort the returned objects by distance from
 *        the given point if `true`
 * @returns {object|array} either a hash of the found players or items
 *          (if `sort` is falsy), or an array sorted by distance
 *          including additional info, with the following structure:
 * ```
 * [
 *     {pc: [human#PA9S7UKB6ND2IKB], dist: 126.06, x: 780, y: -97},
 *     {pc: [human#P1KUXVLVASKLUJ8], dist: 234.7, x: 951, y: -12},
 *     ...
 * ]```
 */
Location.prototype.getInRadius = function getInRadius(x, y, r, players, sort) {
	var targets = players ? this.players : this.items;
	var ret = sort ? [] : {};
	for (var k in targets) {
		var t = targets[k];
		// approximate first (to only calculate sqrt when necessary)
		var dist = (x - t.x) * (x - t.x) + (y - t.y) * (y - t.y);
		if (dist > r * r) continue;
		dist = Math.sqrt(dist);
		if (dist <= r) {
			if (sort) {
				ret.push({pc: t, dist: dist, x: t.x, y: t.y});
			}
			else {
				ret[t.tsid] = t;
			}
		}
	}
	if (sort) {
		ret.sort(function compare(a, b) {
			return a.dist - b.dist;
		});
	}
	return ret;
};
