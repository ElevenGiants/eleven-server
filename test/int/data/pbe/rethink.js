'use strict';

var wait = require('wait.for');
var pbe = require('data/pbe/rethink');
var rdb = require('rethinkdb');
var config = require('config');
var Player = require('model/Player');


suite('rethink', function () {

	var cfg = config.get('pers:backEnd:config:rethink');
	var TABLE = 'dummy';

	function connect(cb) {
		rdb.connect({
			host: cfg.dbhost,
			port: cfg.dbport,
			db: cfg.dbname,
			authKey: cfg.dbauth,
		}, cb);
	}

	function run(func) {
		var args = Array.prototype.slice.call(arguments, 1, arguments.length - 1);
		var callback = arguments[arguments.length - 1];
		connect(function cb(err, conn) {
			if (err) return callback(err);
			func.apply(rdb, args).run(conn, callback);
		});
	}

	suiteSetup(function (done) {
		run(rdb.dbCreate, cfg.dbname, function cb(err, res) {
			if (err) return done(err);
			pbe.init(
				config.get('pers:backEnd:config:rethink'),
				function tableMapper(objOrTsid) {
					return TABLE;
				},
				function cb(err, res) {
					return done(err);
				}
			);
		});
	});

	suiteTeardown(function (done) {
		run(rdb.dbDrop, cfg.dbname, function cb(err, res) {
			if (err) return done(err);
			// restore default table mapper
			pbe.init(config.get('pers:backEnd:config:rethink'), done);
		});
	});

	setup(function (done) {
		run(rdb.tableCreate, TABLE, {primaryKey: 'tsid'}, done);
	});

	teardown(function (done) {
		run(rdb.tableDrop, TABLE, done);
	});


	suite('CRUD', function () {

		test('basic create/read', function (done) {
			wait.launchFiber(function () {
				var p = new Player();
				wait.for(pbe.write, p.serialize());
				var rp = wait.for(pbe.read, p.tsid);
				assert.strictEqual(rp.tsid, p.tsid);
				assert.property(rp, 'stats');
				assert.property(rp, 'metabolics');
				return done();
			});
		});

		test('basic create/delete', function (done) {
			wait.launchFiber(function () {
				var o = {tsid: 'X', ping: 'pong'};
				assert.isNull(wait.for(pbe.read, 'X'));
				wait.for(pbe.write, o);
				assert.strictEqual(wait.for(pbe.read, 'X').ping, 'pong');
				wait.for(pbe.del, o);
				assert.isNull(wait.for(pbe.read, 'X'));
				return done();
			});
		});

		test('basic create/update', function (done) {
			wait.launchFiber(function () {
				var o = {tsid: 'Y', blurp: 1, meh: true};
				wait.for(pbe.write, o);
				assert.strictEqual(wait.for(pbe.read, 'Y').blurp, 1);
				o.blurp = -3;
				delete o.meh;
				wait.for(pbe.write, o);
				assert.strictEqual(wait.for(pbe.read, 'Y').blurp, -3);
				assert.notProperty(wait.for(pbe.read, 'Y'), 'meh');
				return done();
			});
		});
	});
});
