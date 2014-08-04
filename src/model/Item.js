module.exports = Item;


var GameObject = require('model/GameObject');
var OrderedHash = require('model/OrderedHash');
var util = require('util');
var utils = require('utils');


util.inherits(Item, GameObject);
Item.prototype.TSID_INITIAL = 'I';


// define some derived properties (used by GSJS)
Object.defineProperty(Item.prototype, 'isHidden', {
	get: function() {
		return !!this.is_hidden;
	},
});
Object.defineProperty(Item.prototype, 'isStack', {
	get: function() {
		return this.stackmax > 1;
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
 */
function Item(data) {
	Item.super_.call(this, data);
	if (this.x === undefined) this.x = 0;
	if (this.y === undefined) this.y = 0;
	if (!utils.isInt(this.count)) this.count = 1;
	// add some non-enumerable properties (used internally or by GSJS)
	utils.addNonEnumerable(this, 'collDet', false);
	utils.addNonEnumerable(this, 'deleted', false);  // see apiDelete/apiIsDeleted functions
	utils.addNonEnumerable(this, 'slot', undefined);
	utils.addNonEnumerable(this, 'path', this.tsid);
	// enable collision detection if we have a handler function
	if (typeof this.onPlayerCollision === 'function') {
		this['!colliders'] = {};
		this.collDet = true;
	}
	if (this.message_queue) {
		this.message_queue = new OrderedHash(this.message_queue);
	}
	this.updatePath();
}


/**
 * Updates the item's `path` property; needs to be called whenever the
 * item was moved between containers.
 */
Item.prototype.updatePath = function() {
	this.path = this.tsid;
	// climb container chain upwards if container is a bag
	var cont = this.container;
	while (utils.isBag(cont) && !utils.isPlayer(cont)) {
		this.path = cont.tsid + '/' + this.path;
		cont = cont.container;
	}
};
