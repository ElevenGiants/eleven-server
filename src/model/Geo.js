'use strict';

module.exports = Geo;


var pers = require('data/pers');
var rpc = require('data/rpc');
var util = require('util');
var utils = require('utils');
var GameObject = require('model/GameObject');
var Location = require('model/Location');


util.inherits(Geo, GameObject);
Geo.prototype.TSID_INITIAL = 'G';


/**
 * Generic constructor for both instantiating an existing geometry
 * object (from JSON data), and creating a new geo object. Calls
 * {@link Geo#prepConnects|prepConnects}.
 *
 * @param {object} [data] initialization data; **caution**, properties
 *        are shallow-copied and **will** be modified
 *
 * @constructor
 * @augments GameObject
 */
function Geo(data) {
	data = data || {};
	if (!data.tsid) data.tsid = rpc.makeLocalTsid(Geo.prototype.TSID_INITIAL);
	if (!data.layers) data.layers = {middleground: {}};
	Geo.super_.call(this, data);
	this.prepConnects();
}


/**
 * Creates a new `Geo` instance and adds it to persistence.
 *
 * @param {object} [data] geometry data properties
 * @returns {object} a `Geo` instance wrapped in a {@link
 * module:data/persProxy|persistence proxy}
 */
Geo.create = function create(data) {
	return pers.create(Geo, data);
};


/**
 * Converts geometry data `connect` objects in signposts and doors to
 * the format expected by GSJS and client (containing additional
 * properties not present in the persistent data). It is safe to call
 * this function multiple times (e.g. when the geometry has been
 * changed).
 */
Geo.prototype.prepConnects = function prepConnects() {
	if (this.layers && this.layers.middleground) {
		var mg = this.layers.middleground;
		var i, k;
		for (k in mg.signposts) {
			var signpost = mg.signposts[k];
			for (i in signpost.connects) {
				signpost.connects[i] = utils.prepConnect(signpost.connects[i]);
				// remove links to unavailable locations:
				if (!pers.exists(signpost.connects[i].street_tsid)) {
					log.info('%s: removing unavailable signpost connect %s',
						this, signpost.connects[i].street_tsid);
					delete signpost.connects[i];
				}
			}
		}
		for (k in mg.doors) {
			var door = mg.doors[k];
			if (door.connect.target) {
				door.connect = utils.prepConnect(door.connect);
				// remove links to unavailable locations:
				if (!pers.exists(door.connect.street_tsid)) {
					log.info('%s: removing unavailable door connect %s',
						this, door.connect.street_tsid);
					delete mg.doors[k];
				}
			}
		}
	}
};


/**
 * Creates a processed shallow copy of this geometry object, prepared
 * for serialization. The `connect` objects in doors and signposts are
 * converted back to their "persistence form" here (cf. {@link
 * Geo|constructor}).
 *
 * @see {@link GameObject#serialize|GameObject.serialize}
 */
Geo.prototype.serialize = function serialize() {
	var ret = Geo.super_.prototype.serialize.call(this);
	if (ret.layers && ret.layers.middleground) {
		// make sure we're not modifying the actual object data (ret is just a
		// shallow copy so far)
		ret.layers = utils.shallowCopy(ret.layers);
		ret.layers.middleground = utils.shallowCopy(ret.layers.middleground);
		var mg = ret.layers.middleground;
		mg.signposts = utils.shallowCopy(mg.signposts);
		var i, k;
		for (k in mg.signposts) {
			mg.signposts[k] = utils.shallowCopy(mg.signposts[k]);
			var signpost = mg.signposts[k];
			var connects = signpost.connects;
			signpost.connects = {};
			for (i in connects) {
				signpost.connects[i] = revertConnect(connects[i]);
			}
		}
		mg.doors = utils.shallowCopy(mg.doors);
		for (k in mg.doors) {
			mg.doors[k] = utils.shallowCopy(mg.doors[k]);
			mg.doors[k].connect = revertConnect(mg.doors[k].connect);
		}
	}
	return ret;
};


function revertConnect(conn) {
	var ret = utils.shallowCopy(conn);
	// build an objref from street_tsid (GSJS may have modified the connect
	// without adjusting the 'target' property)
	if (conn.street_tsid) {
		ret.target = {
			tsid: conn.street_tsid,
			objref: true,
		};
		if (conn.label) ret.target.label = conn.label;
	}
	delete ret.label;
	delete ret.street_tsid;
	return ret;
}


/**
 * Creates a shallow data-only copy of the geometry to be made
 * available for the GSJS code as `location.clientGeometry`.
 *
 * @param {Location} loc location corresponding to this geometry object
 * @returns {object} shallow copy of the geometry data
 */
Geo.prototype.getClientGeo = function getClientGeo(loc) {
	var ret = utils.shallowCopy(this);
	// client expects location TSID and label here:
	ret.tsid = loc.tsid;
	ret.label = loc.label;
	return ret;
};


/**
 * Creates a small subset of the geometry data to be made available for
 * the GSJS code as `location.geo`.
 *
 * @returns {object} subset of the geometry data with just a few select
 *          properties
 */
Geo.prototype.getGeo = function getGeo() {
	var ret = {
		l: this.l,
		r: this.r,
		t: this.t,
		b: this.b,
		ground_y: this.ground_y,
		swf_file: this.swf_file,
		sources: this.sources,
	};
	if (this.layers && this.layers.middleground) {
		ret.signposts = this.layers.middleground.signposts;
		ret.doors = this.layers.middleground.doors;
	}
	return ret;
};


/**
 * Gets the TSID of the {@link Location} object for this `Geo`.
 *
 * @returns {string} TSID of the corresponding {@link Location} object
 */
Geo.prototype.getLocTsid = function getLocTsid() {
	return Location.prototype.TSID_INITIAL + this.tsid.slice(1);
};

/**
 * Copies a provided Geo into this object
 *
 * @param {object} geometry : The Geo to copy
 */
Geo.prototype.copyGeometryData = function copyGeometryData(geometry) {
	this.copyProps(geometry, ['tsid', 'id', 'label']);
};

/**
 * Gets the closest platform point directly above or below the given
 * coordinates where a player can stand, resp. an item can be placed.
 *
 * @param {number} x x coordinate from which to search for a platform
 * @param {number} y y coordinate from which to search for a platform
 * @param {number} dir search direction (-1 means search below y, 1
 *        means above)
 * @param {boolean} [useItemPerm] if `true`, check item permeability of
 *        platforms (instead of player permeability)
 * @return {object} data structure containing the closest platform
 *         itself, and the point on it with the given x coordinate
 */
Geo.prototype.getClosestPlatPoint = function getClosestPlatPoint(x, y, dir,
	useItemPerm) {
	var closestPlat;
	var point;
	var dist = Number.MAX_VALUE;
	for (var k in this.layers.middleground.platform_lines) {
		var plat = this.layers.middleground.platform_lines[k];
		if (!useItemPerm && plat.platform_pc_perm === 1) continue;
		if (useItemPerm && plat.platform_item_perm === 1) continue;
		var p = utils.pointOnPlat(plat, x);
		if (p) {
			var d = Math.abs(p.y - y);
			if (d < dist && (dir < 0 ? p.y >= y : p.y <= y)) {
				closestPlat = plat;
				point = p;
				dist = d;
			}
		}
	}
	return {plat: closestPlat, point: point};
};


/**
 * Makes sure an x coordinate is within the geometry boundaries.
 *
 * @param {number} x coordinate to test
 * @returns {number} the given `x` if it is within geometry limits,
 *          otherwise the closest x coordinate that is
 */
Geo.prototype.limitX = function limitX(x) {
	return Math.max(this.l, Math.min(this.r, x));
};


/**
 * Makes sure a y coordinate is within the geometry boundaries.
 *
 * @param {number} y coordinate to test
 * @returns {number} the given `y` if it is within geometry limits,
 *          otherwise the closest y coordinate that is
 */
Geo.prototype.limitY = function limitY(y) {
	return Math.min(this.b, Math.max(this.t, y));
};


/**
 * Gets all hitboxes for this `Geo`'s middleground layer.
 *
 * @returns {array} a list of hitbox objects
 */
Geo.prototype.getHitBoxes = function getHitBoxes() {
	var ret = [];
	for (var j in this.layers.middleground.boxes) {
		ret.push(this.layers.middleground.boxes[j]);
	}
	return ret;
};

/**
 * Build up this Geo object from a json object
 *
 * @param {object} data : the json version of data to copy
 */
Geo.prototype.fromJson = function fromJson(data) {
	var key;
	for (key in data.dynamic) {
		this[key] = data.dynamic[key];
	}
	for (key in data) {
		if (key !== 'dynamic') {
			this[key] = data[key];
		}
	}
	//TODO: make (some of) these non-enumerable (those that the client doesn't need/want)? -> would need to make pers layer explicitly aware of those properties then, though
};
