'use strict';

module.exports = DataContainer;


var assert = require('assert');
var GameObject = require('model/GameObject');
var pers = require('data/pers');
var RC = require('data/RequestContext');
var rpc = require('data/rpc');
var RQ = require('data/RequestQueue');
var util = require('util');
var utils = require('utils');


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


/**
 * Creates a new `DataContainer` instance and adds it to persistence.
 *
 * @param {Location|Group|Item|Bag|Player} owner top-level game object
 *        this DC belongs to
 * @returns {object} a `DataContainer` object
 */
DataContainer.create = function create(owner) {
	assert(utils.isLoc(owner) || utils.isItem(owner) || utils.isGroup(owner),
		util.format('invalid DC owner: %s', owner));
	var dc = pers.create(DataContainer, {owner: owner});
	return dc;
};


/**
 * Retrieves the request queue for this data container (typically, the queue of
 * its owner).
 *
 * @returns {RequestQueue} the request queue for this DC
 */
DataContainer.prototype.getRQ = function getRQ() {
	if (this.owner && rpc.isLocal(this.owner)) {
		return this.owner.getRQ();
	}
	return RQ.getGlobal();
};


/**
 * Special helper for instance group cleanup, removing an obsolete instance
 * group reference from a template location's `instances` DC.
 * Called from {@link Group#del} (potentially from a remote GS worker via RPC)
 * when an instance group is cleared.
 *
 * @param {string} instId the instance template ID (e.g. "hell_one")
 * @param {string} instTsid TSID of the instance group that is being deleted
 */
DataContainer.prototype.removeInstance = function removeInstance(instId, instTsid) {
	var instanceList = this.instances ? this.instances[instId] : [];
	for (var i = 0; instanceList && i < instanceList.length; i++) {
		if (instanceList[i].tsid === instTsid) {
			instanceList.splice(i, 1);
			log.debug('instance %s removed from %s instance list in %s',
				instTsid, instId, this.tsid);
			RC.setDirty(this);
			break;
		}
	}
};
