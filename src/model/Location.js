'use strict';

module.exports = Location;


var _ = require('lodash');
var assert = require('assert');
var config = require('config');
var GameObject = require('model/GameObject');
var Geo = require('model/Geo');
var Bag = require('model/Bag');
var Item = require('model/Item');
var IdObjRefMap = require('model/IdObjRefMap');
var OrderedHash = require('model/OrderedHash');
var pers = require('data/pers');
var RC = require('data/RequestContext');
var RQ = require('data/RequestQueue');
var rpc = require('data/rpc');
var util = require('util');
var utils = require('utils');


util.inherits(Location, GameObject);
Location.prototype.TSID_INITIAL = GameObject.prototype.TSID_INITIAL_LOCATION;


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
			data.tsid = rpc.makeLocalTsid(this.TSID_INITIAL_LOCATION);
		}
	}
	Location.super_.call(this, data);
	// initialize items and players, convert to IdObjRefMap
	this.players = new IdObjRefMap(this.players);
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
	assert(_.isObject(geoData), 'no geometry data for ' + this);
	if (rpc.isLocal(this)) {
		this.updateGeo(geoData);
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


Location.prototype.gsOnLoad = function gsOnLoad() {
	Location.super_.prototype.gsOnLoad.call(this);
	// initialize request queue (not strictly necessary b/c it would be created
	// on demand, but this makes the logs easier to grok)
	this.getRQ();
	this.startUnloadInterval();
	// remove broken item refs in locations item list
	pers.clearStaleRefs(this, 'items');
	// clean up stale instance group references
	var instances = _.get(this, 'instances.instances', {});
	for (var k in instances) {
		pers.clearStaleRefs(instances, k);
		if (!instances[k].length) delete instances[k];
	}
};


Location.prototype.gsOnCreate = function gsOnCreate() {
	Location.super_.prototype.gsOnCreate.call(this);
	if (this.class_tsid !== 'home') {  // POLs are unloaded after creation anyway
		this.startUnloadInterval();
	}
};


Location.prototype.startUnloadInterval = function startUnloadInterval() {
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
 * @param {Geo} geo geometry data (location TSID will be derived from
 *        `geo.tsid`)
 * @param {object} [data] additional properties
 * @returns {object} a `Location` object
 */
Location.create = function create(geo, data) {
	data = data || {};
	data.tsid = geo.getLocTsid();
	data.class_tsid = data.class_tsid || 'town';
	return pers.create(Location, data);
};


/**
 * Creates a copy of a template location.
 *
 * @param {Location} src the location to copy
 * @param {object} options settings for the copied location
 * @param {string} options.label label for new location
 * @param {string} options.moteId mote ID for new location
 * @param {string} options.hubId hub ID for new location
 * @param {boolean} options.isInstance is the copied location an instance
 * @param {string} [options.classTsid] alternate class of new location (source
 *        location class by default)
 * @returns {Location|null} the copied location, or `null` if an instance copy
 *          was requested, but the given source is not an instance template
 */
Location.copy = function copy(src, options) {
	if (options.isInstance && !src.instance_me) {
		// temporarily fail gracefully/return null here because of the door to
		// GG in the placeholder location, otherwise instancing fails when quest
		// locations are instanced with `preserve_links` === false
		log.warn('not copying %s (not an instance template)', src);
		return null;
	}
	var isPol = options.classTsid === 'home';
	var geo = Geo.copy(src.geometry, options.label, isPol);
	var ret = Location.create(geo, {
		class_tsid: options.classTsid || src.class_tsid,
		label: options.label,
		moteid: options.moteId,
		hubid: options.hubId,
		is_instance: options.isInstance,
	});
	if (options.isInstance) {
		ret.instance_of = src.tsid;
	}
	ret.copyProps(src, ['class_tsid', 'label', 'moteid', 'hubid', 'instance_me',
		'is_instance', 'instances', 'players', 'items']);
	for (var k in src.items) {
		Item.copy(src.items[k], ret);
	}
	if (!isPol) ret.onCreateAsCopyOf(src);
	else {
		// ensure geo data is initialized (constructor may have skipped it)
		ret.updateGeo(geo);
		// make sure loc (and geo/items) don't stay in persistence cache, as
		// this GS (that created it) may not be the one that is managing it
		RC.getContext().setUnload(ret);
	}
	return ret;
};


/**
 * Retrieves the request queue for this location.
 *
 * @returns {RequestQueue} the request queue for this location
 */
Location.prototype.getRQ = function getRQ() {
	return RQ.get(this);
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
 * Adds a player to the list of players in this location
 *
 * @param {Player} player the player to add
 */
Location.prototype.addPlayer = function addPlayer(player) {
	this.players[player.tsid] = player;
};


/**
 * Calls GSJS event handlers for a player entering a location.
 *
 * @param {Player} player the player that is entering the location
 */
Location.prototype.gsOnPlayerEnter = function gsOnPlayerEnter(player) {
	if (this.onPlayerEnter) {
		this.rqPush(this.onPlayerEnter, player);
	}
	for (var k in this.items) {
		var it = this.items[k];
		if (it && it.onPlayerEnter) {
			try {
				it.rqPush(it.onPlayerEnter, player);
			}
			catch (e) {
				log.error(e, 'error in %s.onPlayerEnter handler', it);
			}
		}
	}
};


/**
 * Removes a player from the list of players in this location and
 * calls various GSJS "onExit" event handlers.
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
				it.rqPush(it.onPlayerExit, player);
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
	// don't unload if there are people around
	for (var tsid in this.players) {
		if (this.players[tsid].isConnected()) return;
	}
	// don't unload if anything is busy growing (e.g. jellisacs, barnacles)
	for (var k in this.items) {
		var it = this.items[k];
		if (it.gsTimers.onGrow) {
			log.debug('not unloading %s, %s is still growing here', this, it);
			return;
		}
		if (it.is_running) {
			log.debug('not unloading %s, %s is still making here', this, it);
			return;
		}
	}
	// still here? go ahead, then
	var self = this;
	this.unload(function cb(err) {
		if (err) log.error(err, 'failed to unload %s', self);
	});
};


/**
 * Schedules this location and its associated geometry object to be released
 * from the live object cache after all pending requests for it have been
 * handled. When this is called, the location's request queue will not accept
 * any new requests.
 *
 * @param {function} [callback] for optional error handling
 */
Location.prototype.unload = function unload(callback) {
	var self = this;
	this.getRQ().push('unload', function unloadReq() {
		for (var tsid in self.items) {
			// unload all items first to stop timers etc
			self.items[tsid].unload();
		}
		// empty out player list as we do not want to persist any
		// lingering references
		self.players = [];
		Location.super_.prototype.unload.call(self);
		self.geometry.unload();
	}, callback, {close: true, obj: this});
};


/**
 * Gets the TSID of the {@link Geo} object for this location.
 *
 * @returns {string} TSID of the corresponding {@link Geo} object
 */
Location.prototype.getGeoTsid = function getGeoTsid() {
	return this.TSID_INITIAL_GEO + this.tsid.slice(1);
};


/**
 * Creates a processed shallow copy of this location, prepared for
 * serialization.
 *
 * @returns {object} shallow copy of the location, prepared for serialization
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
	if (data) this.geometry = data;
	// workaround for GSJS functions that replace the whole geometry property
	if (!(this.geometry instanceof Geo)) {
		// make sure new data does not have a template TSID:
		this.geometry.tsid = this.getGeoTsid();
		this.geometry = Geo.create(this.geometry);
	}
	// process connects for GSJS
	this.geometry.prepConnects();
	// initialize/update clientGeometry and geo properties
	this.clientGeometry = this.geometry.getClientGeo(this);
	this.geo = this.geometry.getGeo();
	// when called through apiGeometryUpdated, assume geo data was manipulated
	// by GSJS, so make sure the current state is persisted
	if (!data) RC.setDirty(this.geometry);
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
	var pcont = item.container;
	if (!item.animSourceTsid) {
		item.animSourceTsid = item.tsid;
	}
	if (!noMerge) {
		for (var k in this.items) {
			var it = this.items[k];
			if (it === item) {
				continue;
			}
			var dist = (x - it.x) * (x - it.x) + (y - it.y) * (y - it.y);
			if (it.class_tsid === item.class_tsid && it.count < it.stackmax &&
				dist < 10000) {
				var initial = item.count;
				if (it.count + item.count > it.stackmax) {
					item.count = it.count + item.count - it.stackmax;
					it.count = it.stackmax;
				}
				else {
					it.count = it.count + item.count;
					item.count = 0;
				}
				if (pcont && utils.isPlayer(pcont)) {
					pcont.createStackAnim('pack_to_floor', item.class_tsid,
						initial - item.count, {
							dest_x: it.x,
							dest_y: it.y,
							orig_path: pcont.tsid + '/' + item.animSourceTsid + '/',
						}
					);
				}
				it.setContainer(this, it.x, it.y);
			}
			if (!item.count) {
				item.del();
				return;
			}
		}
	}
	if (pcont && utils.isPlayer(pcont)) {
		pcont.createStackAnim('pack_to_floor', item.class_tsid, item.count, {
			dest_x: x,
			dest_y: y,
			orig_path: pcont.tsid + '/' + item.animSourceTsid + '/',
		});
	}
	item.setContainer(this, x, y);
};


/**
 * Put an item stack (or a part of it) into a bag in this location, using empty
 * slots or merging with existing stacks.
 *
 * @param {Item} item item stack to add; may be deleted in the process
 * @param {number} fromSlot distribution starts at this slot number
 * @param {number} toSlot distribution ends at this slot number (inclusive;
 *        must be >= `fromSlot`)
 * @param {string} path path to target bag (must be a bag in this location)
 * @param {number} [amount] amount of the item stack to add/distribute; if not
 *        specified, the whole stack is processed
 * @returns {number} amount of remaining items (i.e. that could not be
 *          distributed)
 */
Location.prototype.addToBag = function addToBag(item, fromSlot, toSlot, path, amount) {
	if (amount === undefined || amount > item.count) amount = item.count;
	var bag = this.items[path.split('/').pop()];
	for (var slot = fromSlot; slot <= toSlot && amount > 0; slot++) {
		amount -= bag.addToSlot(item, slot, amount);
	}
	return amount;
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
		var it = this.items[k];
		if (it !== item && it.onContainerItemStateChanged) {
			it.rqPush(it.onContainerItemStateChanged, item);
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
			_.isString(filter) && it.class_tsid === filter ||
			_.isFunction(filter) && filter(it, options));
		if (valid) {
			var rdist = (it.x - x) * (it.x - x) + (it.y - y) * (it.y - y);
			if (!found || rdist < distance) {
				distance = rdist;
				found = it;
			}
		}
	}
	return found;
};
