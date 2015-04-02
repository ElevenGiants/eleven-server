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
var api = require('model/globalApi');


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


Location.prototype.gsOnLoad = function gsOnLoad() {
	Location.super_.prototype.gsOnLoad.call(this);
	// periodically check whether location can be released from memory
	var unloadInt = config.get('pers:locUnloadInt', null);
	if (unloadInt) {
		this.setGsTimer({fname: 'checkUnload', delay: unloadInt, interval: true,
			internal: true});
	}
};


/**
 * Creates a new `Location` instance and adds it to persistence.
 *
 * @param {object} [data] additional properties
 * @returns {object} a `Location` instance wrapped in a {@link
 * module:data/persProxy|persistence proxy}
 */
Location.create = function create(data) {
	data = data || {};
	if (data.geo)
		data.tsid = data.geo.getLocTsid();
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
		if (it && it.onPlayerEnter) {
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
		if (it && it.onPlayerExit) {
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
	if (!(utils.isGeo(this.geometry)) || !this.geometry.__isGO) {
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
 * Sends a special message to all players in the location that includes
 * all currently queued up announcements and changes.
 */
Location.prototype.flush = function flush() {
	for (var tsid in this.players) {
		this.players[tsid].send({type: 'location_event'}, false, true);
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

/**
 *	Copies creates a copy of this location
 *
 * @param {string} [label] name for new location
 * @param {string} [moteId] mote Id for new location
 * @param {string} [hubId] hub Id for new location
 * @param {boolean} [isInstance] Is this new location an instance?
 * @param {string} [altClassTsid] class of new location, defaults to source locations class
 * @returns {Location} the copy of this location
 */
/*jshint -W072 */  // suppress "too many parameters" warning (API function following the spec)
Location.prototype.copyLocation = function copyLocation(label, moteId, hubId,
	isInstance, altClassTsid) {
	var data = {};
	var newGeo = Geo.create(data);
	newGeo.copyGeometryData(this.geometry);

	data = {};
	data.geo = newGeo;
	if (!altClassTsid) altClassTsid = this.class_tsid;
	data.class_tsid = altClassTsid;
	var newLoc = Location.create(data);
	newLoc.copyLocationData(this);
	delete newLoc.label;
	newLoc.label = label;
	newLoc.moteid = moteId;
	newLoc.hubid = hubId;
	newLoc.is_instance = isInstance;
	newLoc.updateGeo(newGeo);

	newLoc.items = new IdObjRefMap({});
	for (var i in this.items) {
		var srcItem = this.items[i];
		var newItem = api.apiNewItemStack(srcItem.class_tsid, srcItem.count);
		newItem.copyProps(srcItem, ['tsid', 'class_tsid', 'count', 'tcont',
				'pcont', 'container']);
		newItem.setContainer(newLoc, srcItem.x, srcItem.y, srcItem.is_hidden);
		newLoc.items[newItem.tsid] = newItem;
	}

	newLoc.onCreateAsCopyOf(this);
	return newLoc;
};
/*jshint +W072 */

/**
 *	Copies the data from the provided location into this location
 *
 * @param {Location} [location] the location to copy data from
 */
Location.prototype.copyLocationData = function copyLocationData(location) {
	this.copyProps(location, ['tsid', 'id', 'class_tsid', 'class_id', 'instances',
	 'playsers', 'activePlayers']);

};

/**
 *	Replaces the currently persisted geometry with the version in memory
 */
Location.prototype.processGeometryUpdate = function processGeometryUpdate() {
	if (!(this.geometry instanceof GameObject)) {
		// replace the entire geometry object
		var data = this.geometry;
		data.tsid = 'G' + this.tsid.slice(1);  // make sure new data does not have a template TSID
		var geo = pers.get(data.tsid);  // get the old geo object...
		geo.fromJson(data);  // ...and update it with new data
		this.geometry = geo;
	}
	this.updateGeometry(this.geometry);
};

/**
 *	Sets up clientGemoetry object and links doors and signposts
 *
 * @param {object} [data] the location to copy data from
 */
Location.prototype.updateGeometry = function updateGeometry(data) {
	log.debug('%s.updateGeometry', this);
	this.geometry = data;
	// create "clientGeometry"
	this.clientGeometry = utils.shallowCopy(this.geometry);
	this.clientGeometry.tsid = this.tsid;  // client expects location TSID here
	this.clientGeometry.label = this.label;  // some geos have different labels
	var cgeo = this.clientGeometry;
	// adjust connect (doors, signposts) proxies for client, without modifying original geometry object
	cgeo.layers = utils.shallowCopy(data.layers);
	cgeo.layers.middleground = utils.shallowCopy(data.layers.middleground);
	cgeo.layers.middleground.signposts =
		utils.shallowCopy(data.layers.middleground.signposts);
	//TODO: should probably use location.prototype.prep_geometry instead of this:
	var i;
	for (i in cgeo.layers.middleground.signposts) {
		cgeo.layers.middleground.signposts[i] =
			utils.shallowCopy(data.layers.middleground.signposts[i]);
		var signpost = cgeo.layers.middleground.signposts[i];
		var connects = signpost.connects;
		signpost.connects = {};
		for (var j in connects) {
			signpost.connects[j] = utils.prepConnect(connects[j]);
		}
	}
	cgeo.layers.middleground.doors = utils.shallowCopy(data.layers.middleground.doors);
	for (i in cgeo.layers.middleground.doors) {
		cgeo.layers.middleground.doors[i] =
			utils.shallowCopy(data.layers.middleground.doors[i]);
		var door = cgeo.layers.middleground.doors[i];
		door.connect = utils.prepConnect(door.connect);
	}
	this.createGeo();
};

/**
 *	Sets up the geo object based on current geometry and clientGeometry
 */
Location.prototype.createGeo = function createGeo() {
	this.geo = {};
	this.geo.l = this.geometry.l;
	this.geo.r = this.geometry.r;
	this.geo.t = this.geometry.t;
	this.geo.b = this.geometry.b;
	this.geo.ground_y = this.geometry.ground_y;
	this.geo.swf_file = this.geometry.swf_file;
	this.geo.signposts = this.clientGeometry.layers.middleground.signposts;
	this.geo.doors = this.clientGeometry.layers.middleground.doors;
	this.geo.sources = this.geometry.sources;
};

/**
 * Find the closest item to the given position in this location.
 *
 * @param {number} x x coordinate to search from
 * @param {number} y y coordinate to search from
 * @param {string|function} [filter] if this is a string, only look for
 *        items with a matching `class_tsid`; if it is a function, the
 *        items in the location will be filtered using `options` as a
 *        parameter like this:
 * ```
 * if (filter(item, options)) {
 *     //code to find closest item
 * }
 * ```
 * @param {object} [options] parameter object for the `filter` function
 * @param {Item} [skipItem] item to exclude from results
 * @returns {Item|null} the found item, or `null` if no item found
 */
Location.prototype.getClosestItem = function getClosestItem(x, y, filter,
	options, skipItem) {
	var distance = 0;
	var found = null;
	for (var k in this.items) {
		var it = this.items[k];
		var valid = (!skipItem || skipItem.tsid !== k) && (!filter ||
			(typeof filter === 'string') && it.class_tsid === filter ||
			(typeof filter === 'function') && filter(it, options));
		if (valid) {
			var rdist = ((it.x - x) * (it.x - x)) + ((it.y - y) * (it.y - y));
			if (!found || rdist < distance) {
				distance = rdist;
				found = it;
			}
		}
	}
	return found;
};
