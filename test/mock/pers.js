'use strict';

// public interface
module.exports = {
	reset: reset,
	get: get,
	add: add,
	postRequestProc: postRequestProc,
	postRequestRollback: postRequestRollback,
	getDirtyList: getDirtyList,
	getUnloadList: getUnloadList,
	preAdd: preAdd,
	registerProxy: registerProxy,
};


var cache = {};
var proxyCache = {};
var dlist = {};
var alist = {};
var ulist = {};


function reset() {
	cache = {};
	proxyCache = {};
	dlist = {};
	alist = {};
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
	dlist[obj.tsid] = obj;
	return obj;
}


function preAdd() {
	for (var i = 0; i < arguments.length; i++) {
		var obj = arguments[i];
		cache[obj.tsid] = obj;
	}
}


function postRequestProc(dl, al, ul, logmsg, postPersCallback) {
	dlist = dl;
	alist = al;
	ulist = ul;
	if (postPersCallback) postPersCallback();
}


function postRequestRollback(dl, al, logmsg, callback) {
	ulist = dl;  // dirty objects are unloaded here
	if (callback) callback();
}


function registerProxy(objref) {
	proxyCache[objref.tsid] = {
		tsid: objref.tsid,
		label: objref.label,
		objref: true,
		__isORP: true,
	};
}


function getDirtyList() {
	return dlist;
}


function getUnloadList() {
	return ulist;
}
