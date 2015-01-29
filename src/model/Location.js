'use strict';

module.exports = Location;


var assert = require('assert');
var GameObject = require('model/GameObject');
var Geo = require('model/Geo');
var Bag = require('model/Bag');
var IdObjRefMap = require('model/IdObjRefMap');
var OrderedHash = require('model/OrderedHash');
var pers = require('data/pers');
var rpc = require('data/rpc');
var util = require('util');
var utils = require('utils');
var lodash = require('lodash');


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
	var geoData = geo || pers.get(this.getGeoTsid());
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


/**
 * Creates a new `Location` instance and adds it to persistence.
 *
 * @param {object} [data] additional properties
 * @returns {object} a `Location` instance wrapped in a {@link
 * module:data/persProxy|persistence proxy}
 */
Location.create = function create(data) {
	data = data || {};
	if(data.geo)
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
	this.clientGeometry = this.geometry.getClientGeo();
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
			this.players[tsid].send(lodash.clone(msg, true), skipChanges);
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
 * Retrieves an item in the location by path.
 *
 * @param {string} path a path string pointing to an item in this
 *        location (like "B1/B2/I3")
 * @returns {Item|null} the requested item, or `null` if not found
 */
Location.prototype.getPath = function getPath(path) {
	return this.getAllItems()[path] || null;
};

Location.prototype.copyLocation = function copyLocation(label, moteId, hubId, is_instance, alt_class_tsid, custom_tsid){
	var data = {};
	if(custom_tsid) data.tsid = 'G' + custom_tsid.slice(1);
	var newGeo = Geo.create(data);
	newGeo.copyGeometryData(this.geometry);
	//newGeo = pers.write(newGeo);
	log.warn('Copied Geo tsid: %s', newGeo.tsid);

	data = {};
	data.geo = newGeo;
	if(!alt_class_tsid) data.class_tsid = this.class_tsid;
	var newLoc = Location.create(data);
	log.warn('Copied Loc tsid: %s', newLoc.tsid);
	log.warn('Before copyLocationData');
	newLoc.copyLocationData(this);
	log.warn('After copyLocationData');
	newLoc.label = label;
	newLoc.moteid = moteId;
	newLoc.hubid = hubId;
	newLoc.is_instance = is_instance;
 	//newLoc = pers.write(newLoc);
	log.warn('Before updateGeo');
	newLoc.updateGeo(newGeo);
	log.warn('After updateGeo');

	//copy items TODO

	newLoc.onCreateAsCopyOf(this);
	return newLoc;
};

Location.prototype.copyLocationData = function copyLocationData(location){
	this.copyProps(location, ['tsid', 'id', 'class_tsid', 'class_id', 'instances',
	 'playsers', 'activePlayers']);

};

Location.prototype.processGeometryUpdate = function processGeometryUpdate(){
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
	cgeo.layers.middleground.signposts = utils.shallowCopy(data.layers.middleground.signposts);
	//TODO: should probably use location.prototype.prep_geometry instead of this:
	for (var i in cgeo.layers.middleground.signposts) {
		cgeo.layers.middleground.signposts[i] = utils.shallowCopy(data.layers.middleground.signposts[i]);
		var signpost = cgeo.layers.middleground.signposts[i];
		var connects = signpost.connects;
		signpost.connects = {};
		for (var j in connects) {
			signpost.connects[j] = prepConnect(connects[j]);
		}
	}
	cgeo.layers.middleground.doors = utils.shallowCopy(data.layers.middleground.doors);
	for (var i in cgeo.layers.middleground.doors) {
		cgeo.layers.middleground.doors[i] = utils.shallowCopy(data.layers.middleground.doors[i]);
		var door = cgeo.layers.middleground.doors[i];
		door.connect = prepConnect(door.connect);
	}
	// create "geo" (only specific fields)
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

function prepConnect(conn) {
	var ret = utils.shallowCopy(conn);
	if (conn.target) {
		ret.target = conn.target;  // may be non-enumerable (when prepConnect used more than once)
		ret.label = conn.target.label;
		ret.street_tsid = conn.target.tsid;
	}
	// client does not need/want target, only GSJS:
	utils.makeNonEnumerable(ret, 'target');
	return ret;
};