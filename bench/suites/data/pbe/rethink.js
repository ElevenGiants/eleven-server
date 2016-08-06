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
var data_huge = JSON.parse(fs.readFileSync('bench/fixtures/D1KUXVLVB4KB1GU70R48.json'));
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
	async.series([
		function init(cb) {
			var tableMapper = function tableMapper(objOrTsid) {
				return TABLE;
			};
			pbe.init(CFG, tableMapper, function (err, res) {
				conn = res;
				return cb(err);
			});
		},
		function createDB(cb) {
			rdb.dbCreate(CFG.dbname).run(conn, cb);
		},
		function createTable(cb) {
			rdb.tableCreate(TABLE, {primaryKey: 'tsid'}).run(conn, cb);
		},
		function loadFixture(cb) {
			pbe.write(data_small, cb);
		},
		function loadFixture(cb) {
			pbe.write(data_medium, cb);
		},
		function loadFixture(cb) {
			pbe.write(data_large, cb);
		},
		function loadFixture(cb) {
			pbe.write(data_huge, cb);
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


function makeFakeObj(tsid, keys, subkeys) {
	// creates a random data object roughly similar in structure to the
	// achievements DC of a seasoned player
	let ret = {tsid};
	for (let i = 0; i < keys; i++) {
		let name = Math.floor(Math.random() * Math.pow(10, 12)).toString(36);
		ret[name] = {};
		for (let j = 0; j < subkeys; j++) {
			let subname = Math.floor(Math.random() * Math.pow(10, 12)).toString(36);
			ret[name][subname] = Math.floor(Math.random() * 10000);
		}
	}
	return ret;
}


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

suite.add('write huge object', function(deferred) {
	data_huge.tsid = i++;
	pbe.write(data_huge, function cb(err, res) {
		if (err) throw err;
		deferred.resolve();
	});
}, {defer: true});

suite.add('write huge random data', function(deferred) {
	var obj = makeFakeObj(i++, 1000, 10);
	pbe.write(obj, function cb(err, res) {
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

suite.add('read huge object', function(deferred) {
	pbe.read('D1KUXVLVB4KB1GU70R48', function cb(err, res) {
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

suite.add('write huge object (soft durability)', function(deferred) {
	data_huge.tsid = i++;
	pbe.write(data_huge, {durability: 'soft'}, function cb(err, res) {
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

suite.add('write huge object (soft durability, noreply)', function(deferred) {
	data_huge.tsid = i++;
	pbe.write(data_huge, {durability: 'soft', noreply: true}, function cb(err, res) {
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
