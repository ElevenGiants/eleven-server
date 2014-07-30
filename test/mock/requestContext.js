// public interface
module.exports = {
	reset: reset,
	getContext: getContext,
	getDirtyList: getDirtyList,
	getObjCache: getObjCache,
	objCachePut: objCachePut,
	objCacheGet: objCacheGet,
	setDirty: setDirty,
};


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
