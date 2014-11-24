'use strict';

var config = require('config');
var path = require('path');
var pers = require('data/pers');
var gsjsBridge = require('model/gsjsBridge');
var GameObject = require('model/GameObject');
var Player = require('model/Player');
var Item = require('model/Item');
var pbeMock = require('../../mock/pbe');
var RC = require('data/RequestContext');
var orproxy = require('data/objrefProxy');


suite('pers', function () {

	var FIXTURES_PATH = path.resolve(path.join(__dirname, '../fixtures'));

	this.timeout(5000);
	this.slow(1000);

	suiteSetup(function () {
		// initialize gsjsBridge data structures (empty) without loading all the prototypes
		gsjsBridge.reset();
	});

	suiteTeardown(function () {
		// reset gsjsBridge so the cached prototypes don't influence other tests
		gsjsBridge.reset();
	});

	setup(function (done) {
		pers.init(pbeMock, FIXTURES_PATH, done);
	});

	teardown(function () {
		pers.init();  // disable mock back-end
	});

	suite('game object loading', function () {

		test('loaded game objects are initialized correctly', function (done) {
			new RC().run(function () {
				var o = pers.get('IHFK8C8NB6J2FJ5');
				assert.instanceOf(o, Item);
				assert.instanceOf(o, GameObject);
				assert.strictEqual(o.constructor.name, o.class_tsid);
				assert.property(o, 'distributeQuoinShards', 'quoin-specific property');
				assert.property(o, 'distanceFromPlayer', 'property from item.js');
			}, done);
		});

		test('recursive structures (Player with inventory) are loaded correctly',
			function (done) {
			new RC().run(function () {
				var p = pers.get('P00000000000002');
				assert.instanceOf(p, Player);
				assert.deepEqual(Object.keys(p.items), ['I00000000000002']);
				assert.isTrue(p.items.I00000000000002.__isORP);
			}, done);
		});

		test('remote and local objects are loaded and proxified correctly in' +
			 ' a cluster setup', function (done) {
			var cfgBackup = config.get();
			config.init(false, {net: {gameServers: {
					gs01: {host: '127.0.0.1', ports: [3000, 3001]},
				}, rpc: {basePort: 17000},
			}}, {gsid: 'gs01-01'});
			// this is dependent on the specific implementation of the TSID ->
			// server mapping, and will have to be adjusted when that changes
			pbeMock.getDB().R1 = {tsid: 'R1'};
			pbeMock.getDB().R2 = {tsid: 'R2'};
			new RC().run(function () {
				var group1 = pers.get('R1');
				assert.isTrue(group1.__isRP);
				var group2 = pers.get('R2');
				assert.notProperty(group2, '__isRP');
				config.init(false, cfgBackup, {});  // restore default test config
			}, done);
		});
	});


	suite('postRequestProc', function () {

		test('skips objects that are not in the live object cache', function (done) {
			pbeMock.getDB().G1 = new GameObject({tsid: 'G1'});
			pbeMock.getDB().G2 = new GameObject({tsid: 'G2'});
			var g2p = orproxy.makeProxy({
				tsid: 'G2',
				objref: true,
			});
			var rc = new RC();
			rc.run(
				function () {
					rc.setDirty(pers.get('G1'));
					rc.setUnload(g2p);
				},
				function cb(err, res) {
					if (err) return done(err);
					var counts = pbeMock.getCounts();
					assert.strictEqual(counts.read, 1, 'just G1 was read');
					assert.strictEqual(counts.write, 1, 'just G1 was written');
					done();
				}
			);
		});
	});
});
