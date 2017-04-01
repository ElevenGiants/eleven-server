'use strict';

module.exports = Geo;


var _ = require('lodash');
var math = require('mathjs');
var pers = require('data/pers');
var rpc = require('data/rpc');
var RQ = require('data/RequestQueue');
var util = require('util');
var utils = require('utils');
var GameObject = require('model/GameObject');
var Location = require('model/Location');


util.inherits(Geo, GameObject);
Geo.prototype.TSID_INITIAL = GameObject.prototype.TSID_INITIAL_GEO;


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
	if (!data.tsid) data.tsid = rpc.makeLocalTsid(this.TSID_INITIAL);
	if (!data.layers) {
		data.layers = {middleground: {decos: {}, doors: {}, signposts: {}}};
	}
	Geo.super_.call(this, data);
	this.prepConnects();
}


/**
 * Creates a new `Geo` instance and adds it to persistence.
 *
 * @param {object} [data] geometry data properties
 * @returns {object} a `Geo` object
 */
Geo.create = function create(data) {
	return pers.create(Geo, data, true);
};


/**
 * Creates a copy of a geometry object, with door/signpost connects removed.
 *
 * @param {Geo} src the geometry object to copy
 * @param {string} label label for the copied geometry
 * @returns {Geo} a "clone" of the source geometry object
 */
Geo.copy = function copy(src, label) {
	var ret = Geo.create({
		label: label,
		tsid: rpc.makeLocalTsid(this.TSID_INITIAL_GEO),
	});
	ret.copyProps(src, ['label']);
	for (var j in ret.layers.middleground.signposts) {
		ret.layers.middleground.signposts[j].connects = {};
	}
	for (var k in ret.layers.middleground.doors) {
		delete ret.layers.middleground.doors[k].connect;
	}
	return ret;
};


/**
 * Retrieves the request queue for the location corresponding to this `Geo`.
 *
 * @returns {RequestQueue} the request queue for this `Geo`'s location
 */
Geo.prototype.getRQ = function getRQ() {
	return RQ.get(this.getLocTsid());
};


/**
 * Converts geometry data `connect` objects in signposts and doors to
 * the format expected by GSJS and client (containing additional
 * properties not present in the persistent data). It is safe to call
 * this function multiple times (e.g. when the geometry has been
 * changed).
 */
Geo.prototype.prepConnects = function prepConnects() {
	if (!rpc.isLocal(this)) {
		log.debug('location not managed by this GS, skipping prepConnects');
	}
	if (this.layers && this.layers.middleground) {
		var mg = this.layers.middleground;
		var i, k;
		for (k in mg.signposts) {
			var signpost = mg.signposts[k];
			utils.addNonEnumerable(signpost, 'toJSON', getSignpostToJSON(signpost));
			for (i in signpost.connects) {
				signpost.connects[i] = prepConnect(signpost.connects[i]);
			}
		}
		for (k in mg.doors) {
			var door = mg.doors[k];
			utils.addNonEnumerable(door, 'toJSON', getDoorToJSON(door));
			if (!door.connect) continue;
			door.connect = prepConnect(door.connect);
		}
	}
};


function prepConnect(conn) {
	var ret = utils.shallowCopy(conn);
	if (conn.target) {
		// target may be non-enumerable (when prepConnect used more than once):
		ret.target = conn.target;
		ret.label = conn.target.label;
		ret.street_tsid = conn.target.tsid;
	}
	// client does not need/want target, only GSJS:
	utils.makeNonEnumerable(ret, 'target');
	return ret;
}


function getSignpostToJSON(signpost) {
	return function toJSON() {
		var ret = utils.shallowCopy(signpost);
		var connects = {};
		for (var k in signpost.connects) {
			connects[k] = connectToJSON(signpost.connects[k]);
		}
		ret.connects = connects;
		return ret;
	};
}


function getDoorToJSON(door) {
	return function toJSON() {
		var ret = utils.shallowCopy(door);
		if (door.connect) {
			ret.connect = connectToJSON(door.connect);
		}
		return ret;
	};
}


function connectToJSON(connect) {
	var ret = utils.shallowCopy(connect);
	if (connect.target) {
		ret.street_tsid = connect.target.tsid;
		ret.label = connect.target.label;
		delete ret.target;
	}
	return ret;
}


/**
 * Creates a processed deep copy of this geometry object, prepared for
 * serialization. The `connect` objects in doors and signposts are converted
 * back to their "persistence form" here (cf. {@link Geo|constructor}).
 *
 * @returns {object} shallow copy of the geometry, prepared for serialization
 *
 * @see {@link GameObject#serialize|GameObject.serialize}
 */
Geo.prototype.serialize = function serialize() {
	var ret = Geo.super_.prototype.serialize.call(this);
	ret = _.cloneDeep(ret, function customizer(val, key) {
		if (key === 'target' && utils.isLoc(val)) {
			return {};  // populated later by revertConnect
		}
	});
	if (ret.layers && ret.layers.middleground) {
		var mg = ret.layers.middleground;
		var i, k;
		for (k in mg.signposts) {
			for (i in mg.signposts[k].connects) {
				mg.signposts[k].connects[i] = revertConnect(
					mg.signposts[k].connects[i]);
			}
		}
		for (k in mg.doors) {
			if (mg.doors[k].connect) {
				mg.doors[k].connect = revertConnect(mg.doors[k].connect);
			}
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
	return this.TSID_INITIAL_LOCATION + this.tsid.slice(1);
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


Geo.prototype.limitPath = function limitPath(item, path) {
	// early-exit check if destination is within geo boundaries anyway
	if (path.x >= this.l && path.x <= this.r &&
		path.y >= this.t && path.y <= this.b) {
		return;
	}
	// no? then change it to the intersection of intended path and geo boundaries
	var pos = [item.x, item.y];
	var dest = [path.x, path.y];
	var bl = [this.l, this.b];
	var tl = [this.l, this.t];
	var br = [this.r, this.b];
	var tr = [this.r, this.t];
	var hit;
	if (dest[0] < this.l) {  // test intersection with left border
		hit = math.intersect(pos, dest, bl, tl);
		if (hit[1] <= this.b && hit[1] >= this.t) dest = hit;
	}
	if (dest[0] > this.r) {  // test intersection with right border
		hit = math.intersect(pos, dest, br, tr);
		if (hit[1] <= this.b && hit[1] >= this.t) dest = hit;
	}
	if (dest[1] > this.b) {  // test intersection with bottom border
		hit = math.intersect(pos, dest, bl, br);
		if (hit[0] >= this.l && hit[0] <= this.r) dest = hit;
	}
	if (dest[1] < this.t) {  // test intersection with top border
		hit = math.intersect(pos, dest, tl, tr);
		if (hit[0] >= this.l && hit[0] <= this.r) dest = hit;
	}
	// update path segment destination coordinates
	path.x = Math.round(dest[0]);
	path.y = Math.round(dest[1]);
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
