'use strict';

// public interface
module.exports = {
	reset: reset,
	getContext: getContext,
	run: run,
	setUnload: setUnload,
	getUnloadList: getUnloadList,
};


var wait = require('wait.for');


var cache = {};
var ulist = {};


function reset() {
	cache = {};
	ulist = {};
}


function getContext() {
	return {
		cache: cache,
	};
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
