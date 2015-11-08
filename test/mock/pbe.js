'use strict';

var fs = require('fs');
var path = require('path');


// public interface
module.exports = {
	init: init,
	read: read,
	write: write,
	del: del,
	getCounts: getCounts,
	getDB: getDB,
};


var fpath = null;
var db = {};
var counts = {};


function init(pbeConfig, callback) {
	if (typeof pbeConfig === 'object') {
		fpath = pbeConfig.fixturesPath;
	}
	db = {};
	counts = {
		read: 0,
		readSuccess: 0,
		write: 0,
		del: 0,
	};
	if (typeof callback === 'function') callback(null);
}


function getCounts() {
	return counts;
}


function getDB() {
	return db;
}


function read(tsid) {
	counts.read++;
	// load test fixture from disk if we have a fixtures path
	if (fpath && !(tsid in db)) {
		var data;
		try {
			data = fs.readFileSync(path.join(fpath, tsid + '.json'));
		}
		catch (e) {
			if (e.code === 'ENOENT') return null;
			throw e;
		}
		db[tsid] = JSON.parse(data);
	}
	counts.readSuccess++;
	return db[tsid];
}


function write(obj, callback) {
	counts.write++;
	db[obj.tsid] = obj;
	if (callback) callback(null, null);
}


function del(obj, callback) {
	counts.del++;
	delete db[obj.tsid];
	if (callback) callback(null, null);
}
