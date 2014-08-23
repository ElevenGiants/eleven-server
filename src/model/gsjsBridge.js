'use strict';

/**
 * Connects the game server and the GSJS code which describes all game
 * behavior. GSJS entity classes and GS model classes are combined here
 * into composite prototypes for the actual "live" game objects.
 *
 * The `group` and `klass` identifiers used in the functions below
 * correspond to the GSJS directory/file structure, which does not map
 * one-to-one to the in-game `GameObject` subclasses and `class_tsid`s.
 *
 * Valid `group` values are: 
 * ```
 *     achievements
 *     groups
 *     items
 *     locations
 *     players
 *     quests
 * ```
 * Valid `klass` values are the file names within the respective
 * directory (apart from include files).
 *
 * @module
 */

// public interface
module.exports = {
	reset: reset,
	init: init,
	getProto: getProto,
	create: create,
	createFromData: createFromData,
};


var assert = require('assert');
var async = require('async');
var fs = require('fs');
var path = require('path');
var util = require('util');
var utils = require('utils');
var Bag = require('model/Bag');
var GameObject = require('model/GameObject');
var Group = require('model/Group');
var Item = require('model/Item');
var Location = require('model/Location');
var Player = require('model/Player');
var Quest = require('model/Quest');
var Geo = require('model/Geo');
var DataContainer = require('model/DataContainer');


// require calls are significantly faster with absolute path
var GSJS_PATH = path.resolve(path.join(process.env.NODE_PATH, 'gsjs'));

// mapping between TSID initials and GSJS model groups or base classes
var TSID_INITIALS_MAP = {
	G: Geo,
	B: 'bags',
	L: 'locations',
	I: 'items',
	P: 'players',
	D: DataContainer,
	R: 'groups',
	Q: 'quests',
};

// container for loaded game object prototypes
var prototypes = {};


/**
 * Initializes the game object prototype cache (according to the GSJS
 * directory structure).
 */
function reset() {
	prototypes = {
		achievements: {},
		groups: {},
		items: {},
		locations: {},
		players: {},
		quests: {},
	};
}


/**
 * Initializes the prototype cache by walking the GSJS directory tree
 * and loading/initializing the prototype for each of the contained
 * game object files. Should be called at server startup.
 *
 * @param {function} callback Called when initialization has finished
 *        successfully, or with an error argument when something goes
 *        wrong (in which case initialization is aborted immediately)
 */
function init(callback) {
	reset();
	// walk GSJS tree and schedule a prototype loading task for each file
	var tasks = [];
	for (var group in prototypes) {
		var groupPath = path.join(GSJS_PATH, group);
		var entries = fs.readdirSync(groupPath);
		for (var i = 0; i < entries.length; i++) {
			var entryPath = path.join(groupPath, entries[i]);
			var klass = entries[i].slice(0, -3);  // strip trailing '.js'
			// skip directories, non-JS files and includes
			if (entryPath.slice(-3) === '.js' && klass.indexOf('inc_') !== 0) {
				tasks.push({group: group, klass: klass});
			}
		}
	}
	// load prototypes without blocking the event loop
	async.eachLimit(tasks, 4, function iterator(task, iterCallback) {
		setImmediate(function() {
			loadProto(task.group, task.klass);
			iterCallback();
		});
	}, callback);
}


/**
 * Retrieves a game object prototype. If the desired type is not in the
 * prototype cache, it is loaded and initialized on demand.
 *
 * @param {string} group general type of the object (see above)
 * @param {string} klass specific type of the object (see above)
 * @returns {object} corresponding game object prototype
 */
function getProto(group, klass) {
	if (!prototypes[group][klass]) {
		loadProto(group, klass);
	}
	return prototypes[group][klass];
}


/**
 * Instantiates and returns a new game object.
 *
 * @param {string} group general type of the object (see above)
 * @param {string} klass specific type of the object (see above)
 * @returns {GameObject} an "empty" game object of the specified type
 *          (instantiated with the default no-argument constructor)
 */
function create(group, klass) {
	/*jshint -W055 */  // ignore lowercase constructor names here
	var ctor = getProto(group, klass).constructor;
	return new ctor();
}


/**
 * Instantiates and returns a new game object from the supplied data
 * (must contain `tsid` and optionally (depending on object type)
 * `class_tsid` properties).
 *
 * @param {object} data initialization data used to determine the right
 *        prototype, and passed through to the game object constructor
 * @returns {GameObject} a game object of the specified type,
 *          instantiated through the default constructor with `data`
 */
function createFromData(data) {
	/*jshint -W055 */  // ignore lowercase constructor names here
	assert(typeof data === 'object', 'object data is required');
	assert(typeof data.tsid === 'string' && data.tsid.length > 1,
		util.format('valid TSID is required (got: %s)', data.tsid));
	var groupOrClass = TSID_INITIALS_MAP[data.tsid[0]];
	if (typeof groupOrClass === 'string') {
		var klass = data.class_tsid || groupOrClass.slice(0, -1);
		var ctor = getProto(groupOrClass, klass).constructor;
		return new ctor(data);
	}
	else {
		return new groupOrClass(data);
	}
}


/**
 * Constructs the prototype for a game object class by combining the
 * properties from the GSJS file(s) with the respective base entity
 * model class.
 *
 * @param {string} group general type of the object (see above)
 * @param {string} klass specific type of the object (see above)
 * @private
 */
function loadProto(group, klass) {
	if (prototypes[group][klass]) {
		log.debug('prototype already loaded: %s.%s', group, klass);
		return;
	}
	log.debug('loading game object prototype: %s.%s', group, klass);
	// create named constructor that relays to model class constructor if possible
	var name = (utils.isInt(klass[0]) ? '_' : '') + klass;  // function name can't start with a digit
	/*jslint evil: true */
	var proto = eval('\
		(function ' + name + '() {\
			if (proto.super_) {\
				proto.super_.apply(this, arguments);\
			}\
		});\
	');
	// inherit from appropriate model class
	if (getModelClass(group, klass)) {
		util.inherits(proto, getModelClass(group, klass));
	}
	// copy over props from group base class (if applicable)
	var baseName = group.slice(0, -1);
	if (group !== 'achievements') {
		var base = require(path.join(GSJS_PATH, group, baseName));
		utils.copyProtoProps(base, proto);
	}
	// special case for bags
	if (group === 'items' && klass.indexOf('bag') === 0 && klass !== 'bag') {
		var bagBase = require(path.join(GSJS_PATH, group, 'bag'));
		utils.copyProtoProps(bagBase, proto);
	}
	// copy over props from object class itself
	if (klass !== baseName) {
		var kls = require(path.join(GSJS_PATH, group, klass));
		utils.copyProtoProps(kls, proto);
	}
	prototypes[group][klass] = proto.prototype;
}


/**
 * Returns the base entity class corresponding to a GSJS object type.
 *
 * @param {string} group general type of the object (see above)
 * @param {string} klass specific type of the object (see above)
 * @returns {object} prototype of the corresponding game object base
 *          class ({@link GameObject} or one of its subclasses)
 * @private
 */
function getModelClass(group, klass) {
	switch (group) {
		case 'groups':
			return Group;
		case 'items':
			if (klass.indexOf('bag') === 0) return Bag;
			return Item;
		case 'locations':
			return Location;
		case 'players':
			return Player;
		case 'quests':
			return Quest;
	}
}
