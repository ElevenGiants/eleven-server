'use strict';

/**
 * A collection of customized `Error` subclasses.
 *
 * @see https://stackoverflow.com/a/5251506
 * @see https://stackoverflow.com/a/8804539
 * @see https://code.google.com/p/v8/wiki/JavaScriptStackTraceApi
 * @module
 */

// public interface
module.exports = {
	DummyError: DummyError,
	NpcMovementError: NpcMovementError,
};


/**
 * A dummy error that can be used to generate (and log) stack traces
 * at arbitrary places in code.
 *
 * @constructor
 */
function DummyError() {
	this.name = 'Stack trace';
	Error.captureStackTrace(this, DummyError);
}
DummyError.prototype = Object.create(Error.prototype);
DummyError.prototype.constructor = DummyError;
DummyError.prototype.name = 'DummyError';


/**
 * NPC movement error, logging an error with debugging data when
 * constructed.
 *
 * @param {ItemMovement} movement the item movement helper instance
 * @param {string} msg an error message describing the problem
 * @param {object} [logData] additional debugging information
 * @constructor
 */
function NpcMovementError(movement, msg, logData) {
	this.message = msg;
	Error.captureStackTrace(this, NpcMovementError);
	var data = {
		npc: movement.item.tsid,
		x: movement.item.x,
		y: movement.item.y,
		path: movement.path,
		callback: movement.callback ? movement.callback.name : null,
		data: logData,
	};
	log.error(data, 'movement: %s', msg);
}
NpcMovementError.prototype = Object.create(Error.prototype);
NpcMovementError.prototype.constructor = NpcMovementError;
NpcMovementError.prototype.name = 'NpcMovementError';
