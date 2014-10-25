'use strict';

var rewire = require('rewire');
var rpc = rewire('data/rpc');
var persMock = require('../../mock/pers');
var orProxy = require('data/objrefProxy');
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
	});

	teardown(function () {
		persMock.reset();
		rpc.__set__('pers', require('data/pers'));
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


		test('works for base cases (groups and locations)', function () {
			assert.strictEqual(rpc.getGsid('L1234'), 'gs-L1234');
			assert.strictEqual(rpc.getGsid({tsid: 'R1234'}), 'gs-R1234');
		});

		test('works for Geos', function () {
			var g = new Geo({tsid: 'GXYZ'});
			var l = new Location({tsid: 'LXYZ'}, g);
			persMock.preAdd(g, l);
			assert.strictEqual(rpc.getGsid(g), 'gs-LXYZ');
			assert.strictEqual(rpc.getGsid('GXYZ'), 'gs-LXYZ');
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
});
