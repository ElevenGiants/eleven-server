'use strict';

module.exports = DataContainer;


var GameObject = require('model/GameObject');
var util = require('util');


util.inherits(DataContainer, GameObject);
DataContainer.prototype.TSID_INITIAL = 'D';


/**
 * Generic constructor for both instantiating an existing data
 * container object (from JSON data), and creating a new one.
 *
 * @param {object} [data] initialization values (properties are
 *        shallow-copied into the object)
 * @constructor
 * @augments GameObject
 */
function DataContainer(data) {
	DataContainer.super_.call(this, data);
}
