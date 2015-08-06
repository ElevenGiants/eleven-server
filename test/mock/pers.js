'use strict';

// public interface
module.exports = {
	reset: reset,
	get: get,
	add: add,
	postRequestProc: postRequestProc,
	getUnloadList: getUnloadList,
	preAdd: preAdd,
	registerProxy: registerProxy,
};


var cache = {};
var proxyCache = {};
var ulist = {};


function reset() {
	cache = {};
	proxyCache = {};
	ulist = {};
}


function get(tsid, noProxy) {
	if (tsid in cache) {
		log.debug('cache hit: %s', tsid);
		return cache[tsid];
	}
	else if (!noProxy && tsid in proxyCache) {
		log.debug('proxy cache hit: %s', tsid);
		return proxyCache[tsid];
	}
	log.debug('cache miss: %s', tsid);
}


function add(obj, flush) {
	cache[obj.tsid] = obj;
	return obj;
}


function preAdd() {
	for (var i = 0; i < arguments.length; i++) {
		var obj = arguments[i];
		cache[obj.tsid] = obj;
	}
}


function postRequestProc(ul, logmsg, postPersCallback) {
	ulist = ul;
	if (postPersCallback) postPersCallback();
}


function registerProxy(objref) {
	proxyCache[objref.tsid] = {
		tsid: objref.tsid,
		label: objref.label,
		objref: true,
		__isORP: true,
	};
}


function getUnloadList() {
	return ulist;
}
