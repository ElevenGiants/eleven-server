'use strict';

var rewire = require('rewire');
var config = rewire('config');
var rpc = rewire('data/rpc');
var persMock = require('../../mock/pers');
var orProxy = require('data/objrefProxy');
var RQ = require('data/RequestQueue');
var Geo = require('model/Geo');
var Location = require('model/Location');
var Player = require('model/Player');
var Item = require('model/Item');
var Quest = require('model/Quest');
var Group = require('model/Group');


suite('rpc', function () {

	setup(function () {
		rpc.__set__('pers', persMock);
		persMock.reset();
		RQ.init();
	});

	teardown(function () {
		persMock.reset();
		rpc.__set__('pers', require('data/pers'));
		RQ.init();
	});


	suite('getGsid', function () {

		setup(function () {
			rpc.__set__('config', {
				mapToGS: function (objOrTsid) {
					var tsid = (typeof objOrTsid === 'string' ?
						objOrTsid : objOrTsid.tsid);
					return {gsid: 'gs-' + tsid};
				},
			});
		});

		teardown(function () {
			rpc.__set__('config', require('config'));
		});


		test('works for base cases (groups, locations, geos)', function () {
			assert.strictEqual(rpc.getGsid('L1234'), 'gs-L1234');
			assert.strictEqual(rpc.getGsid({tsid: 'R1234'}), 'gs-R1234');
			assert.strictEqual(rpc.getGsid({tsid: 'G1234'}), 'gs-G1234');
		});

		test('works for players', function () {
			var l = new Location({tsid: 'L132'}, new Geo());
			var p = new Player({tsid: 'P132', location: 'L132'});
			persMock.preAdd(l, p);
			assert.strictEqual(rpc.getGsid(p), 'gs-L132');
			// same with location objref:
			p.location = new Location({tsid: 'L345'}, new Geo());
			persMock.preAdd(p.location);
			orProxy.proxify(p);
			assert.strictEqual(rpc.getGsid(p), 'gs-L345');
		});

		test('works for items', function () {
			var l = new Location({tsid: 'LX'}, new Geo());
			var i = new Item({tsid: 'I1', tcont: 'LX'});
			persMock.preAdd(l, i);
			assert.strictEqual(rpc.getGsid(i), 'gs-LX');
			assert.strictEqual(rpc.getGsid('I1'), 'gs-LX');
			// also try with a bag in player inventory
			var p = new Player({tsid: 'PX', location: 'LX'});
			i = new Item({tsid: 'B2', tcont: 'PX'});
			persMock.preAdd(p, i);
			assert.strictEqual(rpc.getGsid(i), 'gs-LX');
			assert.strictEqual(rpc.getGsid('B2'), 'gs-LX');
		});

		test('works for quests and DCs', function () {
			// owner can be player...
			var q = new Quest({tsid: 'Q1', owner: 'P1'});
			var p = new Player({tsid: 'P1', location: 'L1'});
			var l = new Location({tsid: 'L1'}, new Geo());
			persMock.preAdd(q, p, l);
			assert.strictEqual(rpc.getGsid(q), 'gs-L1');
			assert.strictEqual(rpc.getGsid('Q1'), 'gs-L1');
			// ...or location...
			l = new Location({tsid: 'L2'}, new Geo());
			persMock.preAdd(l);
			q.owner = l;
			assert.strictEqual(rpc.getGsid(q), 'gs-L2');
			assert.strictEqual(rpc.getGsid('Q1'), 'gs-L2');
			// ...or group
			var g = new Group({tsid: 'RX'});
			persMock.preAdd(g);
			q.owner = g;
			assert.strictEqual(rpc.getGsid(q), 'gs-RX');
			assert.strictEqual(rpc.getGsid('Q1'), 'gs-RX');
		});
	});


	suite('makeLocalTsid', function () {

		this.slow(250);

		var cfgBackup;

		suiteSetup(function () {
			cfgBackup = config.get();
			// simulate a 20 server config (just the pieces relevant for the test)
			config.__set__('gameServers', {});
			for (var i = 0; i < 20; i++) {
				var gsid = 'gs01-' + i;
				config.__get__('gameServers')[gsid] = {gsid: gsid};
			}
			config.__set__('gsids', Object.keys(config.__get__('gameServers')));
			config.__set__('gsid', 'gs01-1');
			rpc.__set__('config', config);
		});

		suiteTeardown(function () {
			config.reset();
			config.init(false, cfgBackup, {});
			rpc.__set__('config', require('config'));
		});


		test('works as expected', function () {
			for (var i = 0; i < 50; i++) {
				var tsid = rpc.makeLocalTsid('R');
				assert.strictEqual(config.mapToGS(tsid).gsid, 'gs01-1');
			}
		});

		test('works for Geos, too', function () {
			var tsid = rpc.makeLocalTsid('G');
			assert.strictEqual(config.mapToGS(tsid).gsid, 'gs01-1');
			var locTsid = 'L' + tsid.substr(1);
			assert.strictEqual(config.mapToGS(locTsid).gsid, 'gs01-1',
				'location and geo are always mapped to the same GS');
		});

		test('fails for non-top-level object types', function () {
			var initials = ['I', 'B', 'D', 'P', 'Q'];
			for (var i = 0; i < initials.length; i++) {
				/*jshint -W083 */
				assert.throw(function () {
					rpc.makeLocalTsid(initials[i]);
				}, assert.AssertionError);
				/*jshint +W083 */
			}
		});
	});
});
