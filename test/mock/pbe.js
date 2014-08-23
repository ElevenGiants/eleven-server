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
};


var fpath = null;
var db = {};
var counts = {};


function init(fixturePath) {
	fpath = fixturePath;
	db = {};
	counts = {
		read: 0,
		write: 0,
		del: 0,
	};
}


function getCounts() {
	return counts;
}


function read(tsid) {
	// load test fixture from disk if we have a fixtures path
	if (fpath && !(tsid in db)) {
		var data = fs.readFileSync(path.join(fpath, tsid + '.json'));
		db[tsid] = JSON.parse(data);
	}
	counts.read++;
	return db[tsid];
}


function write(obj, callback) {
	counts.write++;
	db[obj.tsid] = obj;
	if (callback) callback(null, null);
}


function del(tsid) {
	counts.del++;
	delete db[tsid];
}
