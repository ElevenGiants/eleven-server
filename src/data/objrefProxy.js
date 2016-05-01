'use strict';

/**
 * Functions for handling references (objrefs) between game objects
 * (e.g. items in a player's inventory, or connections between
 * locations).
 *
 * In persistent storage, objrefs are represented in JSON data like
 * this:
 * ```
 *   {
 *     "tsid": "IA9KMI9PTRF3NQM",
 *     "label": "Bubble Tree",
 *     "objref": true
 *   }
 * ```
 * When loading this into server memory, it is converted to an {@link
 * http://wiki.ecmascript.org/doku.php?id=harmony:direct_proxies|
 * ECMAScript 6 direct proxy}, which transparently loads the referenced
 * object when required (not necessarily right away), and relays
 * property access to it.
 *
 * Likewise, when an object is written back to persistence, these
 * proxies are converted back to objrefs.
 *
 * The same process is also applied in different situations where
 * game objects need to be serialized and deserialized (e.g. RPCs
 * between GSs).
 *
 * @see {@link http://wiki.ecmascript.org/doku.php?id=harmony:direct_proxies}
 * @module
 */

// public interface
module.exports = {
	ObjRefProxyError: ObjRefProxyError,
	makeProxy: makeProxy,
	proxify: proxify,
	refify: refify,
	setupObjRefProp: setupObjRefProp,
	copyOwnProps: copyOwnProps,
};


var pers = require('data/pers');
var utils = require('utils');


/**
 * Custom error type for OR proxy related errors.
 *
 * @param {string} [msg] error message
 * @constructor
 */
// see <https://stackoverflow.com/a/5251506>, <https://stackoverflow.com/a/8804539>,
// <https://code.google.com/p/v8/wiki/JavaScriptStackTraceApi>
function ObjRefProxyError(msg) {
	this.message = msg;
	Error.captureStackTrace(this, ObjRefProxyError);
}
ObjRefProxyError.prototype = Object.create(Error.prototype);
ObjRefProxyError.prototype.constructor = ObjRefProxyError;
ObjRefProxyError.prototype.name = 'ObjRefProxyError';


/**
 * Creates a proxy object from an objref data structure. The traps
 * (Proxy API functions) are implemented so that the referenced object
 * is only loaded when it is actually needed (this has the side effect
 * that references to unavailable objects do not cause errors until the
 * objects are eventually accessed).
 *
 * @param {object} objref objref data structure (see above; must contain
 *        at least the `tsid` and `objref` properties)
 * @returns {Proxy} A proxy wrapper for the given objref (as described
 *          in the module docs above).
 */
function makeProxy(objref) {
	return new Proxy(objref, {
		// transparently handle on-access loading from persistence
		get: function get(target, name, receiver) {
			if (name === 'inspect') {
				// node's util module uses this (e.g. during console.log)
				return function inspect(depth) {
					return '^O[' + target.tsid + '|' + target.label + ']';
				};
			}
			if (name === 'valueOf' || name === 'toString' ||
				name === Symbol.toPrimitive) {
				return function () {
					return '^O[' + target.tsid + ']';
				};
			}
			if (name === 'objref' || name === 'tsid' || name === 'label') {
				// what's in the objref can be returned without loading actual object
				return Reflect.get(target, name, receiver);
			}
			// special property required to detect proxies during serialization
			if (name === '__isORP') return true;
			// helper for direct access to the resolved target (just for tests)
			if (name === '__proxyTarget') return resolve(target);
			// property not available in objref -> resolve reference
			return resolve(target)[name];
		},
		// other operations: resolve reference and perform operation on actual object
		set: function set(target, name, val, receiver) {
			if (name === 'label' && val !== undefined) {
				// special case: sync label property in proxy
				target[name] = val;
			}
			resolve(target)[name] = val;
			return true;
		},
		has: function has(target, name) {
			return name in resolve(target);
		},
		deleteProperty: function deleteProperty(target, name) {
			return delete resolve(target)[name];
		},
		enumerate: function enumerate(target) {
			return Reflect.enumerate(resolve(target));
		},
		ownKeys: function ownKeys(target) {
			return Reflect.ownKeys(resolve(target));
		},
		preventExtensions: function preventExtensions(target) {
			return Reflect.preventExtensions(resolve(target));
		},
		getOwnPropertyDescriptor: function getOwnPropertyDescriptor(target, name) {
			return Reflect.getOwnPropertyDescriptor(resolve(target), name);
		},
		// construct/apply operations do not make sense on an objref
		apply: function apply(target, thisArg, args) {
			throw new ObjRefProxyError('apply not supported');
		},
		construct: function construct(target, args) {
			throw new ObjRefProxyError('construct not supported');
		},
	});
}


function resolve(objref) {
	var ret = pers.get(objref.tsid, true);
	if (ret === undefined || ret === null) {
		throw new ObjRefProxyError('referenced object not found: ' +
			objref.tsid + ' (' + objref.label + ')');
	}
	return ret;
}


/**
 * Recursively replaces objrefs with getters/setters in the supplied
 * data (in-place replacement, **the input data will be modified!**).
 *
 * @param {object} data arbitrary data containing objrefs; must not be
 *        an objref itself
 * @param {array} [handled] for internal use (cycle detection)
 */
function proxify(data, handled) {
	handled = handled || [];
	for (var k in data) {
		var v = data[k];
		if (v instanceof Object) {
			if (v.objref === true) {  // explicit check for boolean-type property
				pers.registerProxy(v);
				setupObjRefProp(v.tsid, data, k);
			}
			else {
				if (handled.indexOf(v) !== -1) continue;  // circular ref, v is already covered
				handled.push(v);
				proxify(v, handled);
			}
		}
	}
}


/**
 * Sets up an accessor property descriptor representing an objref. The getter
 * refers access straight to the persistence layer (returning the referenced
 * object itself or a proxy, depending on whether it was already loaded), while
 * the setter causes a new descriptor to be created for the new value.
 *
 * @param {string} tsid TSID of the referenced game object
 * @param {object} parent holder of the reference
 * @param {string} name the desired property name
 */
function setupObjRefProp(tsid, parent, name) {
	Object.defineProperty(parent, name, {
		configurable: true,
		enumerable: true,
		get: function get() {
			return pers.get(tsid);
		},
		set: function set(val) {
			delete this[name];
			if (utils.isGameObject(val)) {
				setupObjRefProp(val.tsid, this, name);
			}
			else {
				this[name] = val;
			}
		},
	});
}


/**
 * Shallow copies own enumerable properties from one object to another,
 * preserving objref accessor descriptors.
 *
 * @param {object} from the source object
 * @param {object} to the target object
 */
function copyOwnProps(from, to) {
	for (var key in from) {
		if (from.hasOwnProperty(key) && !to.hasOwnProperty(key)) {
			var desc = Object.getOwnPropertyDescriptor(from, key);
			Object.defineProperty(to, key, desc);
		}
	}
}


/**
 * Recursively mirrors the supplied data, turning every (direct or
 * indirect) child `GameObject` or objref proxy into an objref.
 *
 * @param {object} data input data (not modified in the process)
 * @param {object} [ret] for internal use (recursion)
 * @returns {object} the resulting transformed data
 */
function refify(data, ret) {
	// handle primitive values
	if (!(data instanceof Object)) {
		return data;
	}
	// handle GameObjects and OR proxies passed in directly
	if (data.__isORP || data.__isGO) {
		return makeRef(data);
	}
	// regular use case (object or array input)
	if (ret === undefined) ret = data instanceof Array ? [] : {};
	for (var k in data) {
		var v = data[k];
		if (!(v instanceof Object)) {
			ret[k] = v;
		}
		else {
			if (v.__isORP || v.__isGO) {
				ret[k] = makeRef(v);
			}
			else {
				ret[k] = v instanceof Array ? [] : {};
				refify(v, ret[k]);
			}
		}
	}
	return ret;
}


/**
 * Generates an objref for a game object. If the supplied object
 * is an OR proxy, the objref is generated without loading the
 * actual object from persistence.
 *
 * @private
 */
function makeRef(obj) {
	var ret = {
		tsid: obj.tsid,
		objref: true,
	};
	if (obj.label !== undefined) ret.label = obj.label;
	return ret;
}
