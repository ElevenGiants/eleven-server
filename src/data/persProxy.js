'use strict';

/**
 * ECMAScript 6 direct proxy helper for persistence. Game objects are
 * wrapped in a proxy that monitors access to its properties; If any of
 * its properties (including nested props) are modified or deleted, the
 * object is flagged as dirty, so the changes will be written to
 * persistence once the current request is finished (this obviously
 * only works within a {@link RequestContext}).
 *
 * @module
 */

// public interface
module.exports = {
	makeProxy: makeProxy,
};


require('harmony-reflect');
var util = require('util');
var RC = require('data/RequestContext');


/**
 * Wraps a game object in a persistence proxy (see module docs above).
 *
 * @param {GameObject} obj game object to wrap
 * @param {object} [prop] internal
 * @returns {Proxy} wrapped game object
 */
function makeProxy(obj, prop) {
	if (prop === undefined) {
		prop = obj;
	}
	if (typeof prop !== 'object' || prop.__isPP) {  // prevent double-wrapping
		return prop;
	}
	var ret = new Proxy(prop, {
		get: function get(target, name, receiver) {
			if (name === '__isPP') {
				return true;
			}
			if (name === 'sort' && typeof target.sort === 'function' &&
				target instanceof Array) {
				// workaround for builtin Array.prototype.sort (calling it on a
				// proxied array throws "illegal access" string otherwise)
				return target.sort.bind(target);
			}
			if (name === 'inspect') {
				return function inspect(depth) {
					return '^P' + util.inspect(target, false, depth, true);
				};
			}
			if (name === 'valueOf' || name === 'toString') {
				return function () {
					return '^P' + target.toString();
				};
			}
			if (name === 'toJSON') {
				// required to prevent weird context-less "illegal access"
				// errors when stringifying proxied objects (or objects with
				// proxied children)
				// see: https://github.com/tvcutsem/harmony-reflect/issues/38
				return function toJSON() {
					return target;
				};
			}
			var ret = target[name];
			if (typeof ret === 'object' && ret !== null && !ret.__isORP &&
				!ret.__isPP && target.propertyIsEnumerable(name) && name[0] !== '!') {
				// nested helper proxy with same container game object
				ret = makeProxy(obj, ret);
				// replace property with proxy (so proxy only needs to be created once)
				target[name] = ret;
			}
			return ret;
		},
		set: function set(target, name, val, receiver) {
			// only set dirty flag for actual value changes
			if (val !== target[name]) {
				target[name] = val;
				if (name[0] !== '!' && target.propertyIsEnumerable(name)) {
					// performance hack: don't persist x/y changes for players
					if (target !== obj || obj.tsid[0] !== 'P' ||
						(name !== 'x' && name !== 'y')) {
						RC.getContext().setDirty(obj);
					}
				}
			}
		},
		deleteProperty: function deleteProperty(target, name) {
			if (name in target) {
				if (name[0] !== '!' && target.hasOwnProperty(name) &&
					target.propertyIsEnumerable(name)) {
					RC.getContext().setDirty(obj);
				}
				return delete target[name];
			}
			return true;  // default delete behavior: return 'true' if property doesn't exist
		},
		enumerate: function enumerate(target) {
			// skip undefined properties because that value cannot be serialized
			// in RethinkDB persistence back-end (no JSON representation)
			var list = [];
			for (var k in target) {
				if (target[k] !== undefined) list.push(k);
				else log.trace('skipped undefined property: ' + k);
			}
			return iterator(list);
		},
		ownKeys: function ownKeys(target) {
			// skip undefined properties because that value cannot be serialized
			// in RethinkDB persistence back-end (no JSON representation)
			var list = Reflect.ownKeys(target);
			var ret = [];
			for (var i = 0; i < list.length; i++) {
				var k = list[i];
				if (target[k] !== undefined) ret.push(k);
				else log.trace('skipped undefined property: ' + k);
			}
			return ret;
		},
	});
	return ret;
}


function iterator(list) {
	var i = 0;
	return {
		next: function next() {
			if (i === list.length) return {
				done: true,
			};
			return {
				done: false,
				value: list[i++],
			};
		}
	};
}
