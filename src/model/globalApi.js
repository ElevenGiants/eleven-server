'use strict';

/* eslint-disable max-len */  // ugly long function names defined by API

/**
 * Global model layer API functions (used by GSJS code).
 *
 * @module
 */

var _ = require('lodash');
var assert = require('assert');
var async = require('async');
var gsjsBridge = require('model/gsjsBridge');
var Property = require('model/Property');
var OrderedHash = require('model/OrderedHash');
var DataContainer = require('model/DataContainer');
var Quest = require('model/Quest');
var Item = require('model/Item');
var Bag = require('model/Bag');
var Group = require('model/Group');
var config = require('config');
var Geo = require('model/Geo');
var rpc = require('data/rpc');
var sessionMgr = require('comm/sessionMgr');
var pers = require('data/pers');
var utils = require('utils');
var Location = require('model/Location');
var logging = require('logging');
var slackChat = require('comm/slackChat');
var crypto = require('crypto');
var util = require('util');
var config = require('config');
var orProxy = require('data/objrefProxy');


function getItemType(classTsid) {
	return classTsid.substr(0, 4) === 'bag_' ? Bag : Item;
}


function isPlayerOnline(tsid) {
	var p = pers.get(tsid);
	return p !== undefined && p.isConnected();
}


/**
 * Creates a deep copy of an object, copying only direct properties
 * and not following objref proxies in the process.
 *
 * @param {object} obj object to copy
 * @param {boolean} cloneGameObjects if `true`, referenced `GameObject`s are
 *        cloned (resulting in non-functional plain object copies); otherwise,
 *        they are copied by reference
 * @returns {object} copy of the given object
 */
function safeClone(obj, cloneGameObjects) {
	var ret = _.clone(obj, true, function customizer(val) {
		if (typeof val === 'object' && val !== null) {
			if (val.__isORP || val.__isGO && !cloneGameObjects) {
				return val;
			}
		}
	});
	return ret;
}


/**
 * Calls a method for each game object in a given list.
 *
 * @param {string} fname name of the function to call for each object
 * @param {string[]|object} targets a list of TSIDs or an object with
 *        TSIDs as keys
 * @param {array} args list of arguments for the called function
 * @param {boolean} [onlineOnly] only apply the function to players who
 *        are currently online (the given TSIDs must only refer to
 *        player objects in this case)
 * @returns {object} a hash with TSIDs as keys and values representing
 *          the function call results as follows:
 *          <ul>
 *            <li>`{ok: 0, error: <error object>}` if an error occurred
 *              while calling the function</li>
 *            <li>`{ok: 0, offline: true}` if the respective player is
 *              not currently online (only possible when `onlineOnly`
 *              is `true`)</li>
 *            <li>`{ok: 1, tsid: <TSID>, res: <return value>}` if the call was
 *              successful and returned a primitive value</li>
 *            <li>`{ok: 1, tsid: <TSID>, <properties of return value...>}` if
 *              the call was successful and returned an object</li>
 *          </ul>
 */
function callFor(fname, targets, args, onlineOnly) {
	//TODO: this is currently not making the function calls in parallel (as
	// described in the GSJS docs), and not applying a timeout on the calls either
	assert(!args || _.isArray(args), 'when specified, args must be an array');
	var tsids = utils.gameObjArgToList(targets, onlineOnly ? utils.isPlayer : null);
	var ret = {};
	for (var i = 0; i < tsids.length; i++) {
		var tsid = tsids[i];
		if (onlineOnly && !isPlayerOnline(tsid)) {
			ret[tsid] = {ok: 0, offline: true};
			continue;
		}
		try {
			var obj = pers.get(tsid);
			var res = obj[fname].apply(obj, args);
			ret[tsid] = _.isObject(res) ? res : {res};
			ret[tsid].tsid = tsid;
			ret[tsid].ok = 1;
		}
		catch (e) {
			ret[tsid] = {ok: 0, error: '' + e};
		}
	}
	return ret;
}


exports.toString = function toString() {
	return 'globalApi';
};


/**
 * Creates a new property object.
 *
 * @param {string} name property name
 * @param {number} value initial value
 * @returns {Property} the new property
 */
exports.apiNewProperty = function apiNewProperty(name, value) {
	log.debug('global.apiNewProperty(%s, %s)', name, value);
	return new Property(name, value);
};


/**
 * Create a new ordered hash object.
 *
 * @returns {OrderedHash} the new ordered hash
 */
exports.apiNewOrderedHash = function apiNewOrderedHash() {
	log.debug('global.apiNewOrderedHash()');
	return new OrderedHash();
};


/**
 * Creates a new data container object assigned to a specific owner.
 *
 * @param {Location|Player|Group} owner owner of the DC object
 * @returns {DataContainer} the new object
 */
exports.apiNewOwnedDC = function apiNewOwnedDC(owner) {
	log.debug('global.apiNewOwnedDC(%s)', owner);
	return DataContainer.create(owner);
};


/**
 * Creates a new quest object assigned to a specific owner.
 *
 * @param {string} classTsid specific class of the quest
 * @param {Location|Player} owner owner of the quest object
 * @returns {Quest} the new object
 */
exports.apiNewOwnedQuest = function apiNewOwnedQuest(classTsid, owner) {
	log.debug('global.apiNewOwnedQuest(%s, %s)', classTsid, owner);
	return Quest.create(classTsid, owner);
};


/**
 * Creates a new group object.
 *
 * @param {string} classTsid specific class of the group
 * @returns {Group} the new group
 */
exports.apiNewGroup = function apiNewGroup(classTsid) {
	log.debug('global.apiNewGroup(%s)', classTsid);
	return Group.create(classTsid);
};


/**
 * Creates a new group object attached to a hub.
 *
 * @param {string} classTsid specific class of the group
 * @param {string} hubId hub to attach the group to
 * @returns {Group} the new group
 */
exports.apiNewGroupForHub = function apiNewGroupForHub(classTsid, hubId) {
	log.debug('global.apiNewGroupForHub(%s, %s)', classTsid, hubId);
	return Group.create(classTsid, hubId);
};


/**
 * Creates a new item (or bag) with the given class.
 *
 * @param {string} classTsid ID of the desired item class
 * @returns {Item|Bag} the new object
 */
exports.apiNewItem = function apiNewItem(classTsid) {
	log.trace('global.apiNewItem(%s)', classTsid);
	return getItemType(classTsid).create(classTsid);
};


/**
 * Creates a new item from a source item.
 *
 * @param {string} classTsid ID of the desired item class
 * @param {Item} sourceItem the item source used for stack anims
 * @returns {Item} the new object
 */
exports.apiNewItemFromSource = function apiNewItemFromSource(classTsid, sourceItem) {
	log.trace('global.apiNewItemFromSource(%s, %s)', classTsid, sourceItem);
	return getItemType(classTsid).create(classTsid, null, sourceItem.x, sourceItem.y);
};


/**
 * Creates a new stack of a specific item class.
 *
 * @param {string} classTsid ID of the desired item class
 * @param {number} count item stack amount (must be a positive integer)
 * @returns {Item} the new object
 */
exports.apiNewItemStack = function apiNewItemStack(classTsid, count) {
	log.trace('global.apiNewItemStack(%s, %s)', classTsid, count);
	return getItemType(classTsid).create(classTsid, count);
};

/**
 * Creates a new itemstack from a source item.
 *
 * @param {string} classTsid ID of the desired item class
 * @param {number} count item stack amount (must be a positive integer)
 * @param {Item} sourceItem the item source used for stack anims
 * @returns {Item} the new object
 */
exports.apiNewItemStackFromSource = function apiNewItemStackFromSource(
	classTsid, count, sourceItem) {
	log.debug('global.apiNewItemStackFromSource(%s, %s, %s)', classTsid, count,
		sourceItem);
	return getItemType(classTsid).create(classTsid, count, sourceItem.x, sourceItem.y);
};


exports.apiNewItemStackFromFamiliar = function apiNewItemStackFromFamiliar(
	classTsid, count) {
	log.debug('global.apiNewItemStackFromFamiliar(%s, %s)', classTsid, count);
	//TODO: adjust&document once itemstack animations are available
	return getItemType(classTsid).create(classTsid, count);
};


/**
 * Creates a new itemstack setting the x/y position.
 *
 * @param {string} classTsid ID of the desired item class
 * @param {number} count item stack amount (must be a positive integer)
 * @param {number} x the x position of the item
 * @param {number} y the y position of the item
 * @returns {Item} the new object
 */
exports.apiNewItemStackFromXY = function apiNewItemStackFromXY(
	classTsid, count, x, y) {
	log.debug('global.apiNewItemStackFromXY(%s, %s, %s, %s)', classTsid, count,
		x, y);
	return getItemType(classTsid).create(classTsid, count, x, y);
};


/**
 * Creates a new, empty location.
 *
 * @param {string} label label for new location
 * @param {string} moteId mote ID for new location
 * @param {string} hubId hub ID for new location
 * @param {string} classTsid class of new location
 * @returns {Location} the new location
 */
exports.apiNewLocation = function apiNewLocation(label, moteId, hubId, classTsid) {
	log.debug('global.apiNewLocation(%s, %s, %s, %s)', label, moteId, hubId,
		classTsid);
	var data = {
		class_tsid: classTsid,
		moteid: moteId,
		hubid: hubId,
	};
	return Location.create(Geo.create(), data);
};


/**
 * Retrieves a game object.
 *
 * @param {string} tsid TSID of the desired object
 * @returns {GameObject|null} the requested object, or `null` if no
 *          object found for the given TSID
 */
exports.apiFindObject = function apiFindObject(tsid) {
	log.trace('global.apiFindObject(%s)', tsid);
	// GSJS code is calling this with invalid TSID, but does not expect it to
	// throw (e.g. in groups/hi_variants_tracker.reset)
	var ret = null;
	if (gsjsBridge.isTsid(tsid)) {
		ret = pers.get(tsid);
	}
	return ret;
};


/**
 * Checks if a player is currently online/in-game.
 *
 * @param {string} tsid player TSID
 * @returns {boolean} `true` if the player is online
 */
exports.apiIsPlayerOnline = function apiIsPlayerOnline(tsid) {
	log.debug('global.apiIsPlayerOnline(%s)', tsid);
	return isPlayerOnline(tsid);
};


/**
 * Stores a record with an arbitrary number of fields in a dedicated
 * game activity log.
 *
 * @param {string} type activity/action type to log (arbitrary string)
 * @param {...string} field log record field like `"key=somevalue"`
 */
exports.apiLogAction = function apiLogAction(type) {
	log.trace('global.apiLogAction()');
	logging.logAction(type, Array.prototype.slice.call(arguments, 1));
};


/**
 * Retrieves the prototype for an item class.
 *
 * @param {string} classTsid ID of the desired item class
 * @returns {object} the prototype object
 */
exports.apiFindItemPrototype = function apiFindItemPrototype(classTsid) {
	log.trace('global.apiFindItemPrototype(%s)', classTsid);
	var proto = gsjsBridge.getProto('items', classTsid);
	if(proto.getAssetInfo)
		proto.assetInfo = proto.getAssetInfo();
	if(proto.getDescExtras)
		proto.descExtras = proto.getDescExtras();
	if(proto.initInstanceProps){
		var defaults = {};
		proto.initInstanceProps.call(defaults);
		proto.defaults = defaults.instanceProps;
	}
	return proto;
};


/**
 * Retrieves the prototype for a quest class.
 *
 * @param {string} classTsid ID of the desired quest class
 * @returns {object} the prototype object
 */
exports.apiFindQuestPrototype = function apiFindQuestPrototype(classTsid) {
	log.debug('global.apiFindQuestPrototype(%s)', classTsid);
	return gsjsBridge.getProto('quests', classTsid);
};


/**
 * Retrieves a game object prototype by path.
 *
 * @param {string} path file system path of the desired game object
 *        prototype (relative to the GSJS root directory)
 * @returns {object} the prototype object
 */
exports.apiGetJSFileObject = function apiGetJSFileObject(path) {
	log.debug('global.apiGetJSFileObject(%s)', path);
	if (path.slice(-3).toLowerCase() === '.js') {
		path = path.slice(0, -3);
	}
	return gsjsBridge.getProto.apply(gsjsBridge, path.split('/'));
};


/**
 * Calls a method on each object in a list of game objects.
 *
 * @param {string} fname name of the function to call for each object
 * @param {string[]|object} targets a list of TSIDs or an object with
 *        TSIDs as keys
 * @param {...*} [args] arbitrary arguments for the called function
 * @returns {object} a hash with TSIDs as keys and values representing
 *          the function call results; see {@link
 *          module:model/globalApi~callFor|callFor} for details
 */
exports.apiCallMethod = function apiCallMethod(fname, targets) {
	log.debug('global.apiCallMethod(%s)',
		Array.prototype.slice.call(arguments).join(', '));
	var args = Array.prototype.slice.call(arguments, apiCallMethod.length);
	return callFor(fname, targets, args);
};


/**
 * Calls a method for each player in a given list. Players that are not
 * currently online are skipped.
 *
 * @param {string} fname name of the function to call for each player
 * @param {string[]|object} targets a list of player TSIDs or an object
 *        with player TSIDs as keys
 * @param {...*} [args] arbitrary arguments for the called function
 * @returns {object} a hash with TSIDs as keys and values representing
 *          the function call results; see {@link
 *          module:model/globalApi~callFor|callFor} for details
 */
exports.apiCallMethodForOnlinePlayers = function apiCallMethodForOnlinePlayers(fname, targets) {
	log.debug('global.apiCallMethodForOnlinePlayers(%s)',
		Array.prototype.slice.call(arguments).join(', '));
	var args = Array.prototype.slice.call(arguments,
		apiCallMethodForOnlinePlayers.length);
	return callFor(fname, targets, args, true);
};


/**
 * Creates a deep copy of an object, copying all direct properties
 * (i.e. those not inherited from a prototype). Can deal with circular
 * references. {@link module:data/objrefProxy|Objref proxies} are not
 * resolved in the process.
 *
 * @param {object} obj object to copy
 * @returns {object} copy of the given object
 */
exports.apiCopyHash = function apiCopyHash(obj) {
	log.trace('global.apiCopyHash');
	return safeClone(obj);
};


/**
 * Returns a serialized copy of the data of a game object, specified by TSID.
 * The returned data may (by nature of being a copy) quickly get out of sync
 * with the original object.
 *
 * @param {string} tsid TSID of the object to retrieve
 * @returns {object} a copy of the desired object's data
 */
exports.apiGetObjectContent = function apiGetObjectContent(tsid) {
	log.debug('global.apiGetObjectContent(%s)', tsid);
	var obj = pers.get(tsid);
	return obj ? obj.serialize() : null;
};


/**
 * Returns a JSON copy of the data of a game object, specified by TSID in an
 * array with all of the objects referenced within it.
 * The returned data may (by nature of being a copy) quickly get out of sync
 * with the original object.
 *
 * @param {string} tsid TSID of the object to retrieve
 * @returns {array} a copy of the desired object and references' data data
 */
exports.apiGetObjectJSON = function apiGetObjectJSON(tsid) {
	log.debug('global.apiGetObjectJSON(%s)', tsid);
	var obj = pers.extract(tsid, true);
	return obj;
};

exports.apiGetObjectGodDetails = function apiGetObjectGodDetails(tsid, includeRefs) {
	var ret = {};
	var objects = pers.extract(tsid, includeRefs);
	for(var i = 0; i < objects.length; i++) {
		var obj = objects[i];
		var tsid = obj.tsid;
		ret[tsid] = {};
		ret[tsid].data = obj;
		ret[tsid].schema = getSchema(obj);
		ret[tsid].options = getOptions(obj);
	}
	return ret;
}

exports.apiGodUpdateObjects = function apiGodUpdateObjects(objs) {
	var results = {};
	for (var tsid in objs) {
		var obj = pers.get(tsid);
		var data = objs[tsid];
		typeConv(data, getSchema(orProxy.refify(obj.serialize())));
		log.info({data: data}, 'updating %s via god interface', tsid);
		try {
			obj.updateProps(data);
			results[tsid] = orProxy.refify(obj.serialize());
		}
		catch (e) {
			log.error(e, 'error updating %s via god interface', tsid);
			results[tsid] = 'error saving ' + tsid + ': ' + e;
		}
	}
	var body = JSON.stringify(results, null, '\t');
	return body;
}


/**
 * Incoming data from AlpacaJS forms already has the right structure
 * (regarding objects and arrays), but the "leaf" property values are
 * all strings. This function casts them back into their original types
 * according to the given schema.
 */
function typeConv(data, schema, parentNode, nodeKey) {
	switch(schema.type) {
		case 'object':
			for (var k in data) {
				if (schema.properties && schema.properties[k]) {
					typeConv(data[k], schema.properties[k], data, k);
				}
			}
			break;
		case 'array':
			for (var i = 0; i < data.length; i++) {
				if (schema.items) {
					typeConv(data[i], schema.items, data, i);
				}
			}
			break;
		case 'null':
			assert(data === null, 'non-null data for null type: ' +
				data + '/' + schema.title);
			break;
		case 'boolean':
			parentNode[nodeKey] = data === 'true' ? true : false;
			break;
		case 'integer':
			parentNode[nodeKey] = parseInt(data, 10);
			break;
		case 'number':
			parentNode[nodeKey] = parseFloat(data);
			break;
		// strings just stay strings
	}
}

/**
 * Creates a suitable JSON schema for the given game object.
 */
function getSchema(obj) {
	log.error(obj.tsid);
	var ret = buildGenericSchema(obj, obj.tsid);
	// modify according to base object type
	if (utils.isGeo(obj)) {
		ret.title = util.format('Geometry');
	}
	else if (utils.isLoc(obj)) {
		ret.title = util.format('Location data');
	}
	else {  // assume item
		ret.title = util.format('%s (%s) %s', obj.class_tsid, obj.label, obj.tsid);
		augmentItemSchema(obj, ret);
	}
	// apply class-specific customizations
	getCustomConfig(obj).forEach(function iter(cconf) {
		if (cconf.schemaOverride) {
			applyCustomOverrides(ret, cconf.schemaOverride);
		}
		if (cconf.customizeSchema) {
			ret = cconf.customizeSchema(obj, ret);
		}
		if (cconf.schemaOrder) {
			reorderSchema(ret, cconf.schemaOrder);
		}
	});
	return ret;
}


/**
 * Creates an AlpacaJS display/editor options object for the given
 * game object.
 */
function getOptions(obj) {
	var ret = buildGenericOptions(obj);
	// special adjustments for items (itemProps)
	if (utils.isItem(obj)) {
		augmentItemOptions(obj, ret);
	}
	// apply class-specific customizations
	getCustomConfig(obj).forEach(function iter(cconf) {
		if (cconf.optionsOverride) {
			applyCustomOverrides(ret, cconf.optionsOverride);
		}
		if (cconf.customizeOptions) {
			ret = cconf.customizeOptions(obj, ret);
		}
	});
	return ret;
}


function buildGenericOptions(obj, nested) {
	var ret = {};
	if (_.isPlainObject(obj)) {
		ret.fields = {};
		for (var k in obj) {
			ret.fields[k] = buildGenericOptions(obj[k], true);
			if (!nested && config.get('god:hidden_properties').indexOf(k) !== -1) {
				ret.fields[k].hidden = true;
			}
			// make nested objects lazy-loading (which implies collapsed) by default
			if (_.isPlainObject(obj[k])) {
				ret.fields[k].lazyLoading = true;
			}
		}
		if (obj.objref === true) {
			ret.fields.objref.hidden = true;
			ret.helper = '(this is an objref)';
		}
	}
	return ret;
}


/**
 * Amends additional schema data to a JSON schema for items, generated
 * from information we can get out of the GSJS item prototypes.
 */
function augmentItemSchema(it, schema) {
	if (!it.instanceProps) {
		// workaround for broken items
		return;
	}
	var proto = getItemPrototype(it.class_tsid);
	var defaults = getInstancePropsDefaults(it.class_tsid);
	schema.properties.instanceProps = {
		type: 'object',
		title: 'instanceProps',
		properties: {},
	};
	for (var k in proto.instancePropsDef) {
		// determine type; skip properties with undefined type
		var type = getSchemaType(it.instanceProps[k]);
		if (type === 'null') {
			type = getSchemaType(defaults[k]);
			if (type === 'null') continue;
		}
		var propSchema = {
			title: k,
			type: type,
			description: proto.instancePropsDef[k],
		};
		schema.properties.instanceProps.properties[k] = propSchema;
		if (k in defaults) {
			propSchema.description += ' (default: ' + defaults[k] + ')';
			propSchema['default'] = defaults[k];
		}
		if (proto.instancePropsChoices[k] && proto.instancePropsChoices[k].length > 1) {
			propSchema['enum'] = proto.instancePropsChoices[k];
			propSchema.required = true;  // otherwise Alpaca insists on including a 'None' choice
		}
	}
}


/**
 * Adds additional options to an AlpacaJS options object for the
 * given item, based on information from the GSJS item prototypes.
 */
function augmentItemOptions(it, options) {
	var proto = getItemPrototype(it.class_tsid);
	// hide count property for non-stacks
	if (it.count && proto.stackmax === 1) {
		options.fields.count.hidden = true;
	}
	// workaround for broken items
	if (!it.instanceProps) return;
	// load and expand instanceProps form by default
	delete options.fields.instanceProps.lazyLoading;
	// for some reason, Alpaca is refusing to cooperate with both 'checkbox'
	// and 'radio' types (current value is not always reflected); only 'select'
	// works right
	for (var k in it.instanceProps) {
		if (proto.instancePropsChoices[k] && proto.instancePropsChoices[k].length > 1) {
			options.fields.instanceProps.fields[k] = {
				type: 'select',
				// also, remove "None" option from all enums
				removeDefaultNone: true,
			};
		}
	}
}


/**
 * Creates a JSON schema for the given game object (of arbitrary type).
 */
function buildGenericSchema(obj, name) {
	var type = getSchemaType(obj);
	if (type === 'null' || type === 'function') return null;
	if (name[0] === '!') return null;
	var ret = {
		title: name,
		type: type,
	};
	if (type === 'array') {
		ret.items = {};
		// if there is anything in the array, we'll just look at the first
		// element and assume all elements should be of the same type
		if (obj.length) {
			ret.items.type = getSchemaType(obj[0]);
		}
	}
	if (type === 'object') {
		ret.properties = {};
		for (var k in obj) {
			var propSchema = buildGenericSchema(obj[k], k);
			if (propSchema) ret.properties[k] = propSchema;
		}
	}
	return ret;
}


/**
 * Recursively overwrites values in an AlpacaJS schema/options object
 * `data` with the corresponding values in `overrides`.
 */
function applyCustomOverrides(data, overrides) {
	if (!overrides) return;
	for (var k in data) {
		if (k in overrides) {
			var v = data[k];
			if (_.isPlainObject(v)) {
				data[k] = applyCustomOverrides(data[k], overrides[k]);
			}
			else {
				data[k] = overrides[k];
			}
		}
	}
	// also add properties that are not in data at all
	for (var k in overrides) {
		if (!(k in data)) {
			data[k] = overrides[k];
		}
	}
	return data;
}


/**
 * Reorders an AlpacaJS JSON schema according to a custom order
 * object, which needs to follow this pattern:
 * {
 *   _self: ['display', 'order', 'of', 'direct', 'properties'],
 *   nested_object: {_self: ['order', 'of', 'properties', 'of', 'nested_object']},
 *   another_object: {
 *     _self: ['etc'],
 *     deeper: {_self: ['turtles', 'all', 'the', 'way', 'down']},
 *   },
 * }
 * The sequence in which properties are added to the schema *usually*
 * governs the display order of the AlpacaJS fields, but since the
 * order of properties in a JS object is non-deterministic, this might
 * not always work.
 */
function reorderSchema(schema, order) {
	var props = {};
	if (order._self){
		for (var i = 0; i < order._self.length; i++) {
			var k = order._self[i];
			if (k in schema.properties) {
				props[k] = schema.properties[k];
			}
		}
	}
	// add keys that are not listed in order._self (in existing order)
	for (var k in schema.properties) {
		if (!props.hasOwnProperty(k)) props[k] = schema.properties[k];
	}
	// process nested objects
	for (var k in order) {
		if (k === '_self') continue;
		if (k in props) reorderSchema(props[k], order[k]);
	}
	schema.properties = props;
}


function getCustomConfig(obj) {
	// hack: relying on the fact that geo objects are the only ones without a class_tsid
	var classTsid = obj.class_tsid ? obj.class_tsid : 'geo';
	var comps = classTsid.split('_');
	var ret = [];
	for (var i = 1; i <= comps.length; i++) {
		var fpath = '../../god/customize/' + comps.slice(0, i).join('_');
		try {
			ret.push(require(fpath));
		}
		catch (e) {
			if (e.code !== 'MODULE_NOT_FOUND') {
				log.error(e, 'could not load god page customizations: %s', fpath);
			}
		}
	}
	return ret;
}

function getSchemaType(v) {
	if (v === null || v === undefined) return 'null';
	var t = typeof v;
	if (v instanceof Array) return 'array';
	if (_.isInteger(v) && t !== 'string') return 'integer';
	return t;
}


function getItemPrototype(class_tsid) {
	return exports.apiFindItemPrototype(class_tsid);
}


function getInstancePropsDefaults(class_tsid) {
	var proto = getItemPrototype(class_tsid);
	var defaults = {};
	if (proto.initInstanceProps) {
		proto.initInstanceProps.call(defaults);
		defaults = defaults.instanceProps;
	}
	return defaults;
}


/**
 * Sends a message to **all** connected clients (on all GS instances).
 * Does not provide any feedback about message delivery status/success.
 *
 * @param {object} msg the message to send
 */
exports.apiSendToAll = function apiSendToAll(msg) {
	log.info({msg: msg}, 'global.apiSendToAll');
	config.forEachGS(function sendToGS(gsconf, cb) {
		if (gsconf.gsid === config.getGsid()) {
			sessionMgr.sendToAll(msg);
		}
		else {
			log.debug('forwarding apiSendToAll request to %s', gsconf.gsid);
			rpc.sendRequest(gsconf.gsid, 'gs', ['sendToAll', [msg]]);
		}
	});
};


/**
 * Sends a message to a group of players.
 *
 * @param {object} msg the message to send
 * @param {object|array|string|Player} recipients player list parameter
 *        (see {@link module:utils~playersArgToList|playersArgToList}
 *        for details)
 */
exports.apiSendToGroup = function apiSendToGroup(msg, recipients) {
	log.debug('global.apiSendToGroup(%s, %s)', msg, recipients);
	slackChat.handleGroupMsg(msg);
	recipients = _.map(utils.playersArgToList(recipients), pers.get);
	async.each(recipients, function send(recipient, cb) {
		try {
			recipient.send(msg, true);
		}
		catch (err) {
			log.error(err, 'error delivering group message to %s', recipient.tsid);
		}
		return cb();
	});
};


exports.apiSendToHub = function apiSendToHub(msg, hubId) {
	log.debug('global.apiSendToHub(%s)', msg);
	log.warn('TODO global.apiSendToHub not implemented yet');
};


exports.apiMD5 = function apiMD5(string) {
	log.debug('global.apiMD5(%s)', string);
	return crypto.createHash('md5').update(string).digest('hex');
};


exports.apiAdminCall = function apiAdminCall(methodName, args) {
	log.debug('global.apiAdminCall(%s, %s)', methodName, args);
	//TODO: forwarding to other game servers
	gsjsBridge.getAdmin()[methodName](args);
};


exports.apiFindGlobalPathX = function apiFindGlobalPathX(from, to) {
	log.debug('global.apiFindGlobalPathX(%s, %s)', from, to);
	//TODO: implement&document me
	log.warn('TODO globa.apiFindGlobalPathX not implemented yet');
	return [];
};


exports.apiFindShortestGlobalPath = function apiFindShortestGlobalPath(from, tos) {
	log.debug('global.apiFindShortestGlobalPath(%s, %s)', from,
		Array.prototype.slice.call(tos).join());
	//TODO: implement&document me
	log.warn('TODO global.apiFindShortestGlobalPath not implemented yet');
	return [];
};


exports.apiReloadDataForGlobalPathFinding = function apiReloadDataForGlobalPathFinding() {
	log.debug('global.apiReloadDataForGlobalPathFinding()');
	log.warn('TODO global.apiReloadDataForGlobalPathFinding not implemented yet');
};


exports.apiAsyncHttpCall = function apiAsyncHttpCall(url, header, postParams, tsid) {
	log.debug('global.apiAsyncHttpCall(%s, %s, %s, %s)', url, header, postParams, tsid);
	log.warn('TODO global.apiAsyncHttpCall not implemented yet');
	//TODO: implement&document me
};


// dummy for original GS's CPU profiling function
//TODO: remove calls from GSJS code
exports.apiResetThreadCPUClock = function apiResetThreadCPUClock(statName) {
	log.trace('global.apiResetThreadCPUClock(%s)', statName);
};

/* eslint-enable max-len */
