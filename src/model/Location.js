module.exports = Location;


var GameObject = require('model/GameObject');
var Geo = require('model/Geo');
var IdObjRefMap = require('model/IdObjRefMap');
var OrderedHash = require('model/OrderedHash');
var pers = require('data/pers');
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
 */
function Location(data, geo) {
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
	this.updateGeo(geo || pers.get(this.getGeoTsid()));
}


// define activePlayers property as read-only alias for players
Object.defineProperty(Location.prototype, 'activePlayers', {
	get: function() {
		return this.players;
	},
	set: function() {
		throw new Error('read-only property: activePlayers');
	},
});


/**
 * Gets the TSID of the {@link Geo} object for this location.
 *
 * @returns {string} TSID of the corresponding {@link Geo} object
 */
Location.prototype.getGeoTsid = function() {
	return Geo.prototype.TSID_INITIAL + this.tsid.slice(1);
};


/**
 * Creates a processed shallow copy of this location, prepared for
 * serialization.
 *
 * @see {@link GameObject#serialize|GameObject.serialize}
 */
Location.prototype.serialize = function() {
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
Location.prototype.updateGeo = function(data) {
	log.debug('%s.updateGeo', this);
	// optional parameter handling
	if (!data) data = this.geometry;
	this.geometry = data;
	// workaround for GSJS functions that replace the whole geometry property
	if (!(this.geometry instanceof Geo)) {
		this.geometry.tsid = this.getGeoTsid();  // make sure new data does not have a template TSID
		this.geometry = pers.add(new Geo(this.geometry));
	}
	// process connects for GSJS
	this.geometry.prepConnects();
	// initialize/update clientGeometry and geo properties
	this.clientGeometry = this.geometry.getClientGeo();
	this.geo = this.geometry.getGeo();
};
