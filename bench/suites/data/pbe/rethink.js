'use strict';

require('../../../setup');
var suite = new (require('benchmark')).Suite;
module.exports = suite;
var async = require('async');
var fs = require('fs');
var rdb = require('rethinkdb');
var pbe = require('data/pbe/rethink');


var CFG = {
	dbhost: 'localhost',
	dbport: 28015,
	dbname: 'eleven_bench',
	dbauth: 'test123',
};
var TABLE = 'dummy';

var conn;

var data_small = JSON.parse(fs.readFileSync('bench/fixtures/IHFK8C8NB6J2FJ5.json'));
var data_medium = JSON.parse(fs.readFileSync('bench/fixtures/PUVF8UK15083AI1XXX.json'));
var data_large = JSON.parse(fs.readFileSync('bench/fixtures/GLI32G3NUTD100I.json'));
var batch_small = [];
var batch_medium = [];
var batch_large = [];
for (var i = 0; i < 200; i++) {
	var s = JSON.parse(JSON.stringify(data_small));
	s.tsid = s.tsid + i;
	batch_small.push(s);
	if (i < 50) {
		var m = JSON.parse(JSON.stringify(data_medium));
		m.tsid = m.tsid + i;
		batch_medium.push(m);
	}
	if (i < 20) {
		var l = JSON.parse(JSON.stringify(data_large));
		l.tsid = l.tsid + i;
		batch_large.push(l);
	}
}


suite.asyncSetup = function(done) {
	async.waterfall([
		function init(cb) {
			pbe.init(CFG, function tableMapper(objOrTsid) { return TABLE; }, cb);
		},
		function createDB(res, cb) {
			conn = res;
			rdb.dbCreate(CFG.dbname).run(conn, cb);
		},
		function createTable(res, cb) {
			rdb.tableCreate(TABLE, {primaryKey: 'tsid'}).run(conn, cb);
		},
		function loadFixture(res, cb) {
			pbe.write(data_small, cb);
		},
		function loadFixture(res, cb) {
			pbe.write(data_medium, cb);
		},
		function loadFixture(res, cb) {
			pbe.write(data_large, cb);
		},
	], done);
};

suite.on('complete', function() {
	rdb.dbDrop(CFG.dbname).run(conn, function cb(err, res) {
		if (err) throw err;
		pbe.close(function cb(err, res) {
			if (err) throw err;
		});
	});
});


var i = 0;

suite.add('write small object', function(deferred) {
	data_small.tsid = i++;
	pbe.write(data_small, function cb(err, res) {
		if (err) throw err;
		deferred.resolve();
	});
}, {defer: true});

suite.add('write medium object', function(deferred) {
	data_medium.tsid = i++;
	pbe.write(data_medium, function cb(err, res) {
		if (err) throw err;
		deferred.resolve();
	});
}, {defer: true});

suite.add('write large object', function(deferred) {
	data_large.tsid = i++;
	pbe.write(data_large, function cb(err, res) {
		if (err) throw err;
		deferred.resolve();
	});
}, {defer: true});

suite.add('write small object batch (n=' + batch_small.length + ')', function(deferred) {
	pbe.write(batch_small, function cb(err, res) {
		if (err) throw err;
		deferred.resolve();
	});
}, {defer: true});

suite.add('write medium object batch (n=' + batch_medium.length + ')', function(deferred) {
	pbe.write(batch_medium, function cb(err, res) {
		if (err) throw err;
		deferred.resolve();
	});
}, {defer: true});

suite.add('write large object batch (n=' + batch_large.length + ')', function(deferred) {
	pbe.write(batch_large, function cb(err, res) {
		if (err) throw err;
		deferred.resolve();
	});
}, {defer: true});

suite.add('read small object', function(deferred) {
	pbe.read('IHFK8C8NB6J2FJ5', function cb(err, res) {
		if (err) throw err;
		deferred.resolve();
	});
}, {defer: true});

suite.add('read medium object', function(deferred) {
	pbe.read('PUVF8UK15083AI1XXX', function cb(err, res) {
		if (err) throw err;
		deferred.resolve();
	});
}, {defer: true});

suite.add('read large object', function(deferred) {
	pbe.read('GLI32G3NUTD100I', function cb(err, res) {
		if (err) throw err;
		deferred.resolve();
	});
}, {defer: true});

suite.add('read random object', function(deferred) {
	var tsid = Math.floor(Math.random() * i);
	pbe.read(tsid, function cb(err, res) {
		if (err) throw err;
		deferred.resolve();
	});
}, {defer: true});

suite.add('write small object (soft durability)', function(deferred) {
	data_small.tsid = i++;
	pbe.write(data_small, {durability: 'soft'}, function cb(err, res) {
		if (err) throw err;
		deferred.resolve();
	});
}, {defer: true});

suite.add('write medium object (soft durability)', function(deferred) {
	data_medium.tsid = i++;
	pbe.write(data_medium, {durability: 'soft'}, function cb(err, res) {
		if (err) throw err;
		deferred.resolve();
	});
}, {defer: true});

suite.add('write large object (soft durability)', function(deferred) {
	data_large.tsid = i++;
	pbe.write(data_large, {durability: 'soft'}, function cb(err, res) {
		if (err) throw err;
		deferred.resolve();
	});
}, {defer: true});

suite.add('write small object (soft durability, noreply)', function(deferred) {
	data_small.tsid = i++;
	pbe.write(data_small, {durability: 'soft', noreply: true}, function cb(err, res) {
		if (err) throw err;
		deferred.resolve();
	});
}, {defer: true});

suite.add('write medium object (soft durability, noreply)', function(deferred) {
	data_medium.tsid = i++;
	pbe.write(data_medium, {durability: 'soft', noreply: true}, function cb(err, res) {
		if (err) throw err;
		deferred.resolve();
	});
}, {defer: true});

suite.add('write large object (soft durability, noreply)', function(deferred) {
	data_large.tsid = i++;
	pbe.write(data_large, {durability: 'soft', noreply: true}, function cb(err, res) {
		if (err) throw err;
		deferred.resolve();
	});
}, {defer: true});

suite.add('write small object batch (n=' + batch_small.length + ', soft durability, noreply)', function(deferred) {
	pbe.write(batch_small, {durability: 'soft', noreply: true}, function cb(err, res) {
		if (err) throw err;
		deferred.resolve();
	});
}, {defer: true});

suite.add('write medium object batch (n=' + batch_medium.length + ', soft durability, noreply)', function(deferred) {
	pbe.write(batch_medium, {durability: 'soft', noreply: true}, function cb(err, res) {
		if (err) throw err;
		deferred.resolve();
	});
}, {defer: true});

suite.add('write large object batch (n=' + batch_large.length + ', soft durability, noreply)', function(deferred) {
	pbe.write(batch_large, {durability: 'soft', noreply: true}, function cb(err, res) {
		if (err) throw err;
		deferred.resolve();
	});
}, {defer: true});
