module.exports = Geo;


var util = require('util');
var utils = require('utils');
var GameObject = require('model/GameObject');


util.inherits(Geo, GameObject);
Geo.prototype.TSID_INITIAL = 'G';


/**
 * Generic constructor for both instantiating an existing geometry
 * object (from JSON data), and creating a new geo object. The
 * `connect` objects in the doors and signposts are prepared for
 * the client and GSJS here (additional properties not present
 * in the persistent data are added).
 *
 * @param {object} [data] initialization data; **caution**, properties
 *        are shallow-copied and **will** be modified
 *
 * @constructor
 * @augments GameObject
 */
function Geo(data) {
	Geo.super_.call(this, data);
	// prepare connects for GSJS and client
	if (this.layers && this.layers.middleground) {
		var mg = this.layers.middleground;
		var i, k;
		for (k in mg.signposts) {
			var signpost = mg.signposts[k];
			for (i in signpost.connects) {
				signpost.connects[i] = prepConnect(signpost.connects[i]);
			}
		}
		for (k in mg.doors) {
			var door = mg.doors[k];
			door.connect = prepConnect(door.connect);
		}
	}
}


function prepConnect(conn) {  // converts a geometry data "connect" to a "connect" as expected by GSJS/client
	var ret = utils.shallowCopy(conn);
	if (conn.target) {
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
Geo.prototype.serialize = function() {
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
