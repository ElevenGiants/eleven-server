'use strict';

var _ = require('lodash');
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
	getWrites: getWrites,
	getReads: getReads,
	getDeletes: getDeletes,
};


var fpath = null;
var db = {};
var counts = {};
var reads = [];
var writes = [];
var deletes = [];


function init(pbeConfig, callback) {
	if (_.isObject(pbeConfig)) {
		fpath = pbeConfig.fixturesPath;
	}
	db = {};
	counts = {
		read: 0,
		readSuccess: 0,
		write: 0,
		del: 0,
	};
	reads = [];
	writes = [];
	deletes = [];
	if (_.isFunction(callback)) callback(null);
}


function getCounts() {
	return counts;
}


function getDB() {
	return db;
}


function getReads() {
	return reads;
}


function getWrites() {
	return writes;
}


function getDeletes() {
	return deletes;
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
	reads.push(tsid);
	return db[tsid];
}


function write(objects, callback) {
	counts.write += objects.length;
	for (var i = 0; i < objects.length; i++) {
		var obj = objects[i];
		writes.push(obj.tsid);
		db[obj.tsid] = obj;
	}
	if (callback) callback(null, null);
}


function del(tsid, callback) {
	counts.del++;
	deletes.push(tsid);
	delete db[tsid];
	if (callback) callback(null, null);
}
