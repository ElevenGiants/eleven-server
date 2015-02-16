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
