// public interface
module.exports = {
	reset: reset,
	getContext: getContext,
	getDirtyList: getDirtyList,
	getObjCache: getObjCache,
	objCachePut: objCachePut,
	objCacheGet: objCacheGet,
	setDirty: setDirty,
	run: run,
};


var wait = require('wait.for');


var cache = {};
var dirty = {};


function reset() {
	cache = {};
	dirty = {};
}


function getContext() {
	return {
		cache: cache,
	};
}


function getObjCache() {
	return cache;
}


function getDirtyList() {
	return Object.keys(dirty);
}


function objCachePut(obj) {
	cache[obj.tsid] = obj;
}


function objCacheGet(tsid) {
	return cache[tsid];
}


function setDirty(obj) {
	dirty[obj.tsid] = obj;
}


function run(func, logtag, owner, callback) {
	wait.launchFiber(function persFiber() {
		try {
			var fiber = getContext();
			fiber.dirty = dirty;
			fiber.cache = cache;
			var res = func();
			if (callback) callback(null, res);
		}
		catch (e) {
			if (callback) callback(e);
			else throw e;
		}
	});
}
