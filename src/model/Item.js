'use strict';

module.exports = Item;


var _ = require('lodash');
var assert = require('assert');
var GameObject = require('model/GameObject');
var OrderedHash = require('model/OrderedHash');
var pers = require('data/pers');
var RC = require('data/RequestContext');
var rpc = require('data/rpc');
var RQ = require('data/RequestQueue');
var util = require('util');
var utils = require('utils');
var ItemMovement = require('model/ItemMovement');


util.inherits(Item, GameObject);
Item.prototype.TSID_INITIAL = 'I';


// define some derived properties (used by GSJS)
Object.defineProperty(Item.prototype, 'isHidden', {
	get: function get() {
		return !!this.is_hidden;
	},
});
Object.defineProperty(Item.prototype, 'isStack', {
	get: function get() {
		return this.stackmax > 1;
	},
});
Object.defineProperty(Item.prototype, 'slot', {
	get: function get() {
		if (utils.isBag(this.container) && !this.is_hidden) return this.x;
	},
});
Object.defineProperty(Item.prototype, 'type', {
	get: function get() {
		return this.class_tsid;
	},
});


/**
 * Generic constructor for both instantiating an existing item (from
 * JSON data), and creating a new item.
 *
 * @param {object} [data] initialization values (properties are
 *        shallow-copied into the item)
 * @constructor
 * @augments GameObject
 * @mixes ItemApi
 */
function Item(data) {
	Item.super_.call(this, data);
	if (this.x === undefined) this.x = 0;
	if (this.y === undefined) this.y = 0;
	// initialize NPC movement
	if (this.gsMovement) {
		this.gsMovement = new ItemMovement(this);
		utils.makeNonEnumerable(this, 'gsMovement');
	}
	else {
		utils.addNonEnumerable(this, 'gsMovement', null);
	}
	if (!utils.isInt(this.count)) this.count = 1;
	// add some non-enumerable properties (used internally or by GSJS)
	utils.addNonEnumerable(this, 'collDet', false);
	utils.addNonEnumerable(this, 'path', this.tsid);
	// enable collision detection if we have a handler function
	if (typeof this.onPlayerCollision === 'function') {
		utils.addNonEnumerable(this, '!colliders', {});
		this.collDet = true;
	}
	if (this.message_queue) {
		this.message_queue = new OrderedHash(this.message_queue);
	}
	this.patchFuncStatsUpdate('use');
	this.patchFuncStatsUpdate('updateState');
}

utils.copyProps(require('model/ItemApi').prototype, Item.prototype);


Item.prototype.gsOnLoad = function gsOnLoad() {
	this.updatePath();
	Item.super_.prototype.gsOnLoad.call(this);
	if (utils.isLoc(this.container) && _.get(this, 'gsMovement.path.length')) {
		log.info('resuming NPC movement for %s', this);
		this.gsMovement.moveStep();
	}
};


/**
 * Creates a processed shallow copy of this item, prepared for
 * serialization.
 *
 * @see {@link GameObject#serialize|GameObject.serialize}
 */
Item.prototype.serialize = function serialize() {
	var ret = Item.super_.prototype.serialize.call(this);
	if (this.gsMovement) {
		ret.gsMovement = GameObject.prototype.serialize.call(this.gsMovement);
	}
	return ret;
};


/**
 * Patches a GSJS function to update client-side item state after being called.
 * This is a hack and most probably not doing it the "right" way; see
 * {@link https://trello.com/c/7JCrUaal}.
 *
 * @param {string} fname name of the function to patch
 * @private
 */
Item.prototype.patchFuncStatsUpdate = function patchFuncStatsUpdate(fname) {
	if (typeof this[fname] === 'function') {
		var gsjsFunc = this[fname];
		this[fname] = function patchedGsjsFunc() {
			var ret = gsjsFunc.apply(this, arguments);
			this.queueChanges();
			return ret;
		};
	}
};


/**
 * Creates a new `Item` instance and adds it to persistence.
 *
 * @param {string} classTsid specific class of the item
 * @param {number} [count] item stack size (1 by default)
 * @returns {object} an `Item` object
 */
Item.create = function create(classTsid, count) {
	assert(classTsid.substr(0, 4) !== 'bag_', util.format(
		'invalid class TSID for Item: %s', classTsid));
	var data = {class_tsid: classTsid};
	if (utils.isInt(count)) {
		data.count = count;
	}
	return pers.create(Item, data);
};


/**
 * Creates an identical copy of an item stack.
 *
 * @param {Item} src the item to copy
 * @param {Location|Player|Bag} [cont] container for the copied item
 * @returns {Item} a "clone" of the source item
 */
Item.copy = function copy(src, cont) {
	var ret = Item.create(src.class_tsid, src.count);
	ret.copyProps(src, ['tcont', 'pcont', 'container']);
	if (cont) ret.setContainer(cont, src.x, src.y);
	return ret;
};


/**
 * Retrieves the request queue for this item (typically, the queue of the
 * location the item is currently in).
 *
 * @returns {RequestQueue} the request queue for this item
 */
Item.prototype.getRQ = function getRQ() {
	if (this.container && rpc.isLocal(this.container)) {
		return this.container.getRQ();
	}
	else {
		return RQ.getGlobal();
	}
};


/**
 * Schedules this item for deletion after the current request.
 */
Item.prototype.del = function del() {
	log.trace('del %s', this);
	log.info('Item.del: %s', this);  // TODO for broken objref debugging, remove when no longer needed
	Item.super_.prototype.del.call(this);
	if (this.container) {
		RC.setDirty(this.container);
		delete this.container.items[this.tsid];
		delete this.container.hiddenItems[this.tsid];
		delete this.container;
		this.queueChanges();
	}
};


/**
 * Updates the item's `path` property; needs to be called whenever the
 * item was moved between containers.
 */
Item.prototype.updatePath = function updatePath() {
	this.path = this.tsid;
	// climb container chain upwards if container is a bag
	var cont = this.container;
	while (utils.isBag(cont) && !utils.isPlayer(cont)) {
		this.path = cont.tsid + '/' + this.path;
		cont = cont.container;
	}
};


/**
 * Sets the item's coordinates within the current container. Will place
 * the item on the next platform below the given coordinates if it is
 * configured to obey physics and the container is a location.
 *
 * @param {number} x new horizontal coordinate
 * @param {number} y new vertical coordinate
 * @returns {boolean} `true` if the item's coordinates actually changed
 */
Item.prototype.setXY = function setXY(x, y) {
	assert(!isNaN(x) && !isNaN(y), 'invalid coordinates');
	if (this.itemDef && this.itemDef.obey_physics && utils.isLoc(this.container)) {
		var pp = this.container.geometry.getClosestPlatPoint(x, y, -1, true);
		if (pp && pp.point) {
			x = pp.point.x;
			y = pp.point.y;
		}
	}
	x = Math.round(x);
	y = Math.round(y);
	if (x !== this.x || y !== this.y) {
		this.x = x;
		this.y = y;
		return true;
	}
	return false;
};


/**
 * Assigns the item to a container (may be the current container, e.g.
 * when moving an item to a different bag slot). Removes it from the
 * previous container's item list, adds it to the new one and
 * updates internal properties accordingly.
 *
 * @param {Location|Player|Bag} cont new container for the item
 * @param {number} x x coordinate in the new location, or slot number
 *        if the container is a player or bag (irrelevant when adding
 *        as hidden item)
 * @param {number} y y coordinate in the new location (irrelevant when
 *        adding to player/bag)
 * @param {boolean} [hidden] item will be hidden in the new container
 *        (`false` by default)
 */
/*jshint -W071 */
Item.prototype.setContainer = function setContainer(cont, x, y, hidden) {
	var tcont = cont.tcont ? cont.tcont : cont.tsid;
	assert(utils.isPlayer(tcont) || utils.isLoc(tcont), util.format(
		'tcont for %s is neither player nor location: %s', this, tcont));
	if (!utils.isLoc(cont)) {  // bag or player
		y = -888888888;
		x = hidden ? -888888888 : x;
		if (!hidden) {
			assert(utils.isInt(x) && x < cont.capacity,
				util.format('invalid slot number for %s: %s', this, x));
		}
	}
	// change entries in old and new container (unless they are one and the same)
	RC.setDirty(this);
	var prev = this.container;
	this.container = cont;
	if (!prev || prev.tsid !== cont.tsid) {
		if (prev) {
			RC.setDirty(prev);
			delete prev.items[this.tsid];
			delete prev.hiddenItems[this.tsid];
		}
		RC.setDirty(cont);
		cont[hidden ? 'hiddenItems' : 'items'][this.tsid] = this;
	}
	// queue removal change if top container changed
	if (tcont !== this.tcont) {
		this.queueChanges(true);
	}
	// assign to new container and queue addition/update changes
	this.tcont = tcont;
	this.is_hidden = !!hidden;
	this.setXY(x, y);
	this.updatePath();
	this.queueChanges();
	// send changes immediately when adding a new item to a location; in case
	// it is replacing another item (e.g. reviving a trant with fertilidust, or
	// assembling a machine), the client tries to handle the "delete" change
	// twice otherwise (resulting in a "... not exists in location, but a delete
	// changes was sent for it" error popup)
	if (!prev && utils.isLoc(cont)) {
		cont.flush();
	}
	this.sendContChangeEvents(prev);
};
/*jshint +W071 */


/**
 * Calls various GSJS event handler functions for this item and other
 * items in the same (current or previous) container after a container
 * change.
 *
 * @param {Location|Player|Bag} [prev] previous container
 * @private
 */
Item.prototype.sendContChangeEvents = function sendContChangeEvents(prev) {
	var cont = this.container;
	var k, it;
	if (prev !== cont) {
		if (this.onContainerChanged) {
			this.onContainerChanged(prev, cont);
		}
		if (prev) {
			for (k in prev.items) {
				it = prev.items[k];
				if (it && it.onContainerItemRemoved) {
					it.rqPush(it.onContainerItemRemoved, this, cont);
				}
			}
		}
	}
	if (!prev || prev !== cont) {
		for (k in cont.items) {
			it = cont.items[k];
			if (it && it.onContainerItemAdded) {
				it.rqPush(it.onContainerItemAdded, this, prev);
			}
		}
	}
};


/**
 * Retrieves the object that determines the actual position of this
 * item in its current location (i.e. the x/y coordinates). This is
 * either a player, a bag in a location, or the item itself.
 *
 * @returns {Player|Bag|Item} the game object that determines the
 *          actual x/y position of the item, or `undefined` if no such
 *          object exists (e.g. while the item is being created)
 */
Item.prototype.getPosObject = function getPosObject() {
	// special case: no container (yet, i.e. during item creation)
	if (!this.container) return;
	//jscs:disable safeContextKeyword
	var ret = this;
	// traverse container chain until we reach a player or a
	// direct child item of a location
	while (ret.container && !utils.isPlayer(ret) && !utils.isLoc(ret.container)) {
		ret = ret.container;
	}
	return ret;
	//jscs:enable safeContextKeyword
};


/**
 * Tells the item's top level container to include changes for this
 * item in the next message to the client (resp. all clients of players
 * in the location, if the top container is a `Location`).
 *
 * @param {boolean} [removed] if `true`, create a removal change record
 * @param {boolean} [compact] if `true`, create a *short* change record
 *        (only coordinates and state, for NPC movement)
 */
Item.prototype.queueChanges = function queueChanges(removed, compact) {
	if (this.tcont && !this.is_hidden) {
		pers.get(this.tcont).queueChanges(this, removed, compact);
	}
};


/**
 * Generates a data record with information about the current state of
 * the item, for inclusion in the `changes` segment of a message to the
 * client.
 *
 * @param {Player} pc player whose client this data will be sent to
 *        (required because some of the fields are "personalized")
 * @param {boolean} [removed] if `true`, this record will mark the
 *        item as deleted (used when items change containers, in which
 *        case they are marked deleted in the changes for the previous
 *        container)
 * @param {boolean} [compact] if `true`, create a *short* change record
 *        (only coordinates and state, for NPC movement)
 * @returns {object} changes data set
 */
/*jshint -W071 */  // suppress "too many statements" warning (this is a fairly trivial function)
Item.prototype.getChangeData = function getChangeData(pc, removed, compact) {
	var ret = {};
	ret.x = this.x;
	ret.y = this.y;
	if (this.state) ret.s = this.buildState(pc);
	if (compact) {
		return ret;
	}
	ret.path_tsid = this.path;
	ret.class_tsid = this.class_tsid;
	ret.count = (removed || this.deleted) ? 0 : this.count;
	ret.label = this.getLabel ? this.getLabel() : this.label;
	if (!removed && this.slot !== undefined) ret.slot = this.slot;
	if (this.z) ret.z = this.z;
	if (this.rs) ret.rs = this.rs;
	if (this.isSoulbound && this.isSoulbound() && this.soulbound_to) {
		ret.soulbound_to = this.soulbound_to;
	}
	if (this.is_tool) ret.tool_state = this.get_tool_state();
	if (this.is_consumable) ret.consumable_state = this.get_consumable_state();
	if (this.getTooltipLabel) ret.tooltip_label = this.getTooltipLabel();
	if (this.make_config) ret.config = this.make_config();
	if (!this.deleted) {
		if (this.isSelectable && !this.isSelectable(pc)) ret.not_selectable = true;
		if (this.onStatus) ret.status = this.onStatus(pc);
	}
	return ret;
};
/*jshint +W071 */


/**
 * Splits off the given amount from the item into a separate new item.
 * Obviously only works for stackable items, and handles invalid
 * arguments gracefully by just not returning a new item (notably, if
 * the given amount equals or exceeds the available stack size).
 *
 * @param {number} n the amount to split off
 * @returns {Item} a new item with count `n`, or `undefined` if the
 *          desired split is not possible
 */
Item.prototype.split = function split(n) {
	if (n < 1 || !utils.isInt(n)) {
		log.warn('invalid split amount: %s', n);
		return;
	}
	if (n >= this.count) return;
	RC.setDirty(this);
	this.count -= n;
	var newItem = Item.create(this.class_tsid, n);
	if (this.is_soulbound_item) {
		newItem.is_soulbound_item = this.is_soulbound_item;
		newItem.soulbound_to = this.soulbound_to;
	}
	this.queueChanges();
	return newItem;
};


/**
 * Transfers the given amount from another item to this item; if this
 * reduces the other item's count to 0, it is scheduled for deletion.
 * Only works for stackable items, and handles invalid arguments
 * gracefully (not performing any merging) as far as possible.
 *
 * @param {Item} that item to merge *from*
 * @param {number} n amount to transfer
 * @returns {number} amount actually transferred (can be less than `n`
 *          due to maximum stack size constraint)
 */
Item.prototype.merge = function merge(that, n) {
	if (n < 1 || !utils.isInt(n)) {
		log.warn('invalid merge amount: %s', n);
		return 0;
	}
	this.count = parseInt(this.count, 10);
	that.count = parseInt(that.count, 10);
	n = Math.min(parseInt(n, 10), that.count);
	// if items are non-stackable or incompatible, just return zero
	if (!(this.stackmax > 1 && that.stackmax > 1)) return 0;
	if (this.class_tsid !== that.class_tsid) return 0;
	if (this.soulbound_to !== that.soulbound_to) return 0;
	var moved = Math.min(n, this.stackmax - this.count);
	RC.setDirty(this);
	RC.setDirty(that);
	that.count -= moved;
	this.count += moved;
	if (that.count <= 0) that.del();
	else that.queueChanges();
	this.queueChanges();
	return moved;
};


/**
 * Decreases the item count by `n` (or by `count`, if `n > count`).
 * If the count is 0 afterwards, the item is flagged for deletion.
 *
 * @param {number} n the amount to decrease the item count by
 * @returns {number} actual amount of consumed items
 */
Item.prototype.consume = function consume(n) {
	assert(utils.isInt(n) && n >= 0, 'invalid consumption amount: ' + n);
	n = Math.min(n, this.count);
	RC.setDirty(this);
	this.count -= n;
	if (this.count <= 0) this.del();
	else this.queueChanges();
	return n;
};


/**
 * Internal movement interval handler (necessary because the GameObject
 * timers/intervals system refers to methods by name, so we cannot set
 * up an interval for the {@link ItemMovement#moveStep} function
 * directly).
 * @private
 */
Item.prototype.movementTimer = function movementTimer() {
	if (this.gsMovement) this.gsMovement.moveStep();
};


/**
 * Starts item movement.
 *
 * @param {string} transport the transportation for this movement
 * @param {object} dest destination for the movement (see {@link
 *        ItemMovement#startMove})
 * @param {object} options for this movement (see {@link
 *        ItemMovement#startMove})
 * @returns {boolean} true if movement is possible and started
 */
Item.prototype.gsStartMoving = function gsStartMoving(transport, dest, options) {
	if (!this.gsMovement) this.gsMovement = new ItemMovement(this);
	return this.gsMovement.startMove(transport, dest, options);
};


/**
 * Stops item movement.
 */
Item.prototype.gsStopMoving = function gsStopMoving() {
	if (this.gsMovement && this.gsMovement.isMoving()) this.gsMovement.stopMove();
};


/**
 * Adds a hitbox of given size and name.
 *
 * @param {number} w the width of the hitbox
 * @param {number} h the height of the hitbox
 * @param {string} [name] the name of the hitbox to add
 */
Item.prototype.addHitBox = function addHitBox(w, h, name) {
	if (name) {
		if (this.hitBoxes === undefined) {
			this.hitBoxes = {};
		}
		this.hitBoxes[name] = {w: w, h: h};
	}
	else {
		this.hitBox = {w: w, h: h};
	}
};


/**
 * Removes a specific hitbox by given name.
 *
 * @param {string} name the name of the hitbox to remove
 * @return {boolean} `true` if the hitbox existed and was successfully
 *         removed
 */
Item.prototype.removeHitBox = function removeHitBox(name) {
	if (this.hitBoxes && this.hitBoxes.hasOwnProperty(name)) {
		delete this.hitBoxes[name];
		// remove entire hitBoxes property if empty
		if (!Object.keys(this.hitBoxes).length) {
			delete this.hitBoxes;
		}
		return true;
	}
	return false;
};


/**
 * Find the closest item to this item in its location.
 *
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
 * @returns {Item|null} the found item, or `null` if no item found
 */
Item.prototype.getClosestItem = function getClosestItem(filter, options) {
	if (utils.isLoc(this.container)) {
		return this.container.getClosestItem(this.x, this.y, filter, options, this);
	}
	return null;
};
