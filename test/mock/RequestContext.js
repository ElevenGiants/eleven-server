'use strict';

// public interface
module.exports = {
	reset: reset,
	getContext: getContext,
	getDirtyList: getDirtyList,
	setDirty: setDirty,
	run: run,
	setUnload: setUnload,
	getUnloadList: getUnloadList,
};


var wait = require('wait.for');


var cache = {};
var dirty = {};
var ulist = {};


function reset() {
	cache = {};
	dirty = {};
	ulist = {};
}


function getContext() {
	return {
		cache: cache,
		setDirty: setDirty,
	};
}


function getDirtyList() {
	return Object.keys(dirty);
}


function setDirty(obj) {
	dirty[obj.tsid] = obj;
}


function run(func, logtag, owner, callback) {
	wait.launchFiber(function persFiber() {
		try {
			var res = func();
			if (callback) callback(null, res);
		}
		catch (e) {
			if (callback) callback(e);
			else throw e;
		}
	});
}


function setUnload(obj) {
	ulist[obj.tsid] = obj;
}


function getUnloadList() {
	return ulist;
}
