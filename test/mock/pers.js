// public interface
module.exports = {
	reset: reset,
	get: get,
	add: add,
	processDirtyList: processDirtyList,
	getDirtyList: getDirtyList,
};


var cache = {};
var dlist = {};


function reset() {
	cache = {};
	dlist = {};
}


function get(tsid, dontCache) {
	if (tsid in cache) {
		log.debug('cache hit: %s', tsid);
		return cache[tsid];
	}
	log.debug('cache miss: %s', tsid);
}


function add(obj, flush) {
	cache[obj.tsid] = obj;
}


function processDirtyList(list, logmsg) {
	dlist = list;
}


function getDirtyList() {
	return dlist;
}

