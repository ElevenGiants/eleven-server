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
				signpost.connects[i] = prepConnect(signpost.connects[i]);
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
			door.connect = prepConnect(door.connect);
			// remove links to unavailable locations:
			if (!pers.exists(door.connect.street_tsid)) {
				log.info('%s: removing unavailable door connect %s',
					this, door.connect.street_tsid);
				delete mg.doors[k];
			}
		}
	}
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
}


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
	delete ret.label;
	delete ret.street_tsid;
	ret.target = conn.target;  // was not copied by shallowCopy (non-enumerable)
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
 * Gets the closest platform point directly above or below the given
 * coordinates where a PC can stand (i.e. `platform_pc_perm === -1`).
 *
 * @param {number} x x coordinate from which to search for a platform
 * @param {number} y y coordinate from which to search for a platform
 * @param {number} dir search direction (-1 means search below y, 1
 *        means above)
 * @return {object} data structure containing the closest platform
 *         itself, and the point on it with the given x coordinate
 */
Geo.prototype.getClosestPlatPoint = function getClosestPlatPoint(x, y, dir) {
	var closestPlat;
	var point;
	var dist = Number.MAX_VALUE;
	for (var k in this.layers.middleground.platform_lines) {
		var plat = this.layers.middleground.platform_lines[k];
		if (plat.platform_pc_perm !== -1) continue;
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
