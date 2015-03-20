'use strict';

var gsjsBridge = require('model/gsjsBridge');
var RC = require('data/RequestContext');
var Bag = require('model/Bag');
var Item = require('model/Item');
var Player = require('model/Player');
var Location = require('model/Location');
var Geo = require('model/Geo');
var pers = require('data/pers');
var utils = require('utils');
var pbeMock = require('../../mock/pbe');
var helpers = require('../../helpers');


suite('Bag', function () {

	setup(function () {
		gsjsBridge.init(true);
		pers.init(pbeMock);
	});

	teardown(function () {
		gsjsBridge.reset();
		pers.init();  // disable mock back-end
	});


	suite('ctor', function () {

		test('loads items correctly (without infinite loop due to container reference)',
			function (done) {
			pbeMock.getDB().B1 = {
				class_tsid: 'bag_furniture',
				tsid: 'B1',
				tcont: 'LX',
				items: [
					{
						label: 'Chair',
						objref: true,
						tsid: 'I1',
					},
				],
			};
			pbeMock.getDB().I1 = {
				class_tsid: 'furniture_chair',
				tsid: 'I1',
				tcont: 'LX',
				container: {
					label: 'Private Furniture Storage',
					objref: true,
					tsid:  'B1',
					},
					x: 0, y: 0,
			};
			new RC().run(function () {
				Location.create(Geo.create({tsid: 'GX'}));
				pers.get('B1');
			}, done);
		});

		test('preserves non-default capacity', function () {
			/*jshint -W055 */  // deliberate lowercase constructor name here
			var ctor = gsjsBridge.getProto('items', 'bag_generic_gray').constructor;
			var b = new ctor({capacity: 10, class_tsid: 'bag_generic_gray'});
			assert.strictEqual(b.capacity, 10);
			/*jshint +W055 */
		});
	});


	suite('create', function () {

		test('does its job', function (done) {
			new RC().run(
				function () {
					var b = Bag.create('bag_bigger_gray');
					assert.isTrue(b.__isPP);
					assert.isTrue(utils.isBag(b));
					assert.strictEqual(b.class_tsid, 'bag_bigger_gray');
					assert.strictEqual(b.constructor.name, 'bag_bigger_gray');
				},
				function cb(err, res) {
					if (err) return done(err);
					var db = pbeMock.getDB();
					assert.strictEqual(pbeMock.getCounts().write, 1);
					assert.strictEqual(Object.keys(db).length, 1);
					assert.strictEqual(db[Object.keys(db)[0]].class_tsid,
						'bag_bigger_gray');
					done();
				}
			);
		});

		test('does not accept non-bag class TSIDs', function () {
			assert.throw(function () {
				Bag.create('pi');
			}, assert.AssertionError);
		});

		test('capacity defined in GSJS overrides default', function (done) {
			new RC().run(function () {
				var b = Bag.create('bag_moving_box');
				assert.strictEqual(b.capacity, 1000);
			}, done);
		});
	});


	suite('addToSlot', function () {

		test('adds whole itemstack to empty slot', function (done) {
			var i = new Item({tsid: 'I1'});
			i.queueChanges = function noop() {};  // changeset creation not tested here
			var b = new Bag({tsid: 'B1', tcont: 'PDUMMY'});
			new RC().run(function () {
				var merged = b.addToSlot(i, 3);
				assert.strictEqual(merged, 1);
				assert.deepEqual(b.items, {I1: i});
				assert.strictEqual(i.slot, 3);
				assert.strictEqual(i.x, 3);
				assert.strictEqual(i.container, b);
			}, done);
		});

		test('merges partial itemstack with existing item', function (done) {
			new RC().run(function () {
				var i1 = Item.create('apple', 5);
				i1.queueChanges = function noop() {};  // changes not tested here
				var i2 = Item.create('apple', 8);
				var b = Bag.create('bag_bigger_gray');
				b.tcont = 'PDUMMY';
				i1.setContainer(b, 3);
				var merged = b.addToSlot(i2, 3, 2);
				assert.strictEqual(merged, 2);
				assert.strictEqual(i1.count, 7);
				assert.strictEqual(i1.container, b);
				assert.strictEqual(i2.count, 6);
				assert.isUndefined(i2.container);
			}, done);
		});

		test('does not add more than stackmax', function (done) {
			var rc = new RC();
			rc.run(function () {
				var p = new Player({tsid: 'PX', location: {tsid: 'LDUMMY'}});
				rc.cache[p.tsid] = p;
				var i = Item.create('apple', 80);
				i.stackmax = 30;
				var b = Bag.create('bag_bigger_gray');
				b.tcont = 'PX';
				var merged = b.addToSlot(i, 0);
				assert.strictEqual(merged, 30);
				assert.strictEqual(b.getSlot(0).class_tsid, 'apple');
				assert.notStrictEqual(b.getSlot(0).tsid, i.tsid);
				assert.strictEqual(b.getSlot(0).count, 30);
				assert.strictEqual(i.count, 50);
			}, done);
		});

		test('does not merge incompatible items', function (done) {
			new RC().run(function () {
				var i1 = Item.create('apple', 5);
				i1.queueChanges = function noop() {};  // changes not tested here
				var i2 = Item.create('pi');
				var b = Bag.create('bag_bigger_gray');
				b.tcont = 'PDUMMY';
				i1.setContainer(b, 3);
				var merged = b.addToSlot(i2, 3);
				assert.strictEqual(merged, 0);
				assert.strictEqual(i1.count, 5);
				assert.strictEqual(i1.container, b);
				assert.strictEqual(i2.count, 1);
				assert.isUndefined(i2.container);
			}, done);
		});

		test('queues appropriate changes when moving an item from a player ' +
			'inventory bag to a location bag (e.g. furniture)', function (done) {
			var rc = new RC();
			rc.run(function () {
				var l = Location.create(Geo.create());
				var p = helpers.getOnlinePlayer({tsid: 'PX', location: l});
				l.players[p.tsid] = rc.cache[p.tsid] = p;
				var fbag = Bag.create('bag_bigger_green');
				fbag.setContainer(l, 1, 2);
				var i = Item.create('pi');
				var bag = Bag.create('bag_bigger_gray');
				bag.setContainer(p, 1);
				bag.addToSlot(i, 0);
				p.changes = [];  // dump previous changes, we're testing the following
				fbag.addToSlot(i, 3);
				assert.lengthOf(p.changes, 2);
				var cd = p.changes[0].itemstack_values.pc[i.tsid];
				assert.strictEqual(cd.count, 0, 'removed from bag in inventory');
				assert.strictEqual(cd.path_tsid, bag.tsid + '/' + i.tsid);
				assert.notProperty(cd, 'slot');
				cd = p.changes[1].itemstack_values.location[i.tsid];
				assert.strictEqual(cd.path_tsid, fbag.tsid + '/' + i.tsid);
				assert.strictEqual(cd.count, 1, 'added to bag in location');
				assert.strictEqual(cd.slot, 3);
			}, done);
		});
	});


	suite('getChangeData', function () {

		test('works as expected (simple bag)', function (done) {
			new RC().run(function () {
				var b = Bag.create('bag_bigger_gray');
				var cd = b.getChangeData();
				assert.strictEqual(cd.class_tsid, 'bag_bigger_gray');
				assert.strictEqual(cd.count, 1);
				assert.strictEqual(cd.path_tsid, b.tsid);
				assert.strictEqual(cd.slots, 16);
			}, done);
		});
	});


	suite('getAllItems', function () {

		test('make sure GSJS does not fill hidden bags when purchasing from vendors',
			function (done) {
			new RC().run(function () {
				var p = pers.create(Player, {location: Location.create(Geo.create())});
				var remaining = p.createItemFromSource('watering_can', 99, p, true);
				assert.strictEqual(remaining, 83, '99 cans created, 16 player' +
					' inventory slots filled, 83 remaining');
				// check that inventory was filled
				assert.strictEqual(Object.keys(p.items).length, p.capacity);
				Object.keys(p.items).forEach(function isCan(tsid) {
					assert.strictEqual(p.items[tsid].class_tsid, 'watering_can');
					assert.strictEqual(p.items[tsid].count, 1);
				});
				// make sure nothing was added to SDB in furniture bag
				var fbag = p.hiddenItems[p.furniture.storage_tsid];
				Object.keys(fbag.items).forEach(function check(tsid) {
					var it = fbag.items[tsid];
					if (it.class_tsid === 'bag_furniture_sdb') {
						assert.strictEqual(Object.keys(it.items).length, 0,
							'nothing added to SDB in furniture bag');
					}
				});
			}, done);
		});
	});
});
