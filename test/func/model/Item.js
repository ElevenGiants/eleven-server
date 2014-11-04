'use strict';

var gsjsBridge = require('model/gsjsBridge');
var RC = require('data/RequestContext');
var Item = require('model/Item');
var Player = require('model/Player');
var Location = require('model/Location');
var Geo = require('model/Geo');
var pers = require('data/pers');
var utils = require('utils');
var pbeMock = require('../../mock/pbe');


suite('Item', function () {

	setup(function () {
		gsjsBridge.init(true);
		pers.init(pbeMock);
	});

	teardown(function () {
		gsjsBridge.reset();
		pers.init();  // disable mock back-end
	});


	suite('create', function () {

		test('does its job', function (done) {
			new RC().run(
				function () {
					var it = Item.create('pi', 7);
					assert.isTrue(it.__isPP);
					assert.isTrue(utils.isItem(it));
					assert.strictEqual(it.class_tsid, 'pi');
					assert.strictEqual(it.constructor.name, 'pi');
					assert.strictEqual(it.count, 7);
				},
				function cb(err, res) {
					if (err) return done(err);
					var db = pbeMock.getDB();
					assert.strictEqual(pbeMock.getCounts().write, 1);
					assert.strictEqual(Object.keys(db).length, 1);
					assert.strictEqual(db[Object.keys(db)[0]].class_tsid, 'pi');
					done();
				}
			);
		});

		test('count defaults to 1', function (done) {
			new RC().run(function () {
				assert.strictEqual(Item.create('apple').count, 1);
			}, done);
		});

		test('does not accept bag class TSIDs', function () {
			assert.throw(function () {
				Item.create('bag_bigger_gray');
			}, assert.AssertionError);
		});
	});


	suite('split', function () {

		test('works as intended', function (done) {
			new RC().run(function () {
				var it = new Item({class_tsid: 'apple', count: 5});
				var split = it.split(3);
				assert.notStrictEqual(it.tsid, split.tsid);
				assert.strictEqual(split.class_tsid, 'apple');
				assert.strictEqual(it.count, 2);
				assert.strictEqual(split.count, 3);
			}, done);
		});

		test('handles invalid arguments gracefully', function (done) {
			new RC().run(function () {
				var it = new Item({class_tsid: 'apple', count: 5});
				assert.isUndefined(it.split(0));
				assert.isUndefined(it.split(-1));
				assert.isUndefined(it.split('three'));
				assert.isUndefined(it.split(5));
				assert.strictEqual(it.count, 5);
			}, done);
		});

		test('transfers soulbound attribute to new item', function (done) {
			new RC().run(function () {
				var it = new Item({class_tsid: 'apple', count: 5,
					is_soulbound_item: true, soulbound_to: 'Garfield'});
				var split = it.split(1);
				assert.isTrue(split.is_soulbound_item);
				assert.strictEqual(split.soulbound_to, 'Garfield');
				assert.strictEqual(split.count, 1);
			}, done);
		});

		test('returns undefined for non-stackable items', function () {
			var it = new Item({class_tsid: 'trant_bubble'});
			assert.isUndefined(it.split(1));
		});

		test('queues appropriate changes', function (done) {
			var rc = new RC();
			rc.run(function () {
				var p = new Player({tsid: 'PX', location: {tsid: 'LDUMMY'}});
				rc.cache[p.tsid] = p;  // add to RC cache so pers.get('PX') works
				var it = new Item(
					{tsid: 'IX', class_tsid: 'meat', count: 5, tcont: 'PX'});
				it.split(3);
				assert.lengthOf(p.changes, 1);
				var cd = p.changes[0].itemstack_values.pc[it.tsid];
				assert.strictEqual(cd.path_tsid, it.tsid);
				assert.strictEqual(cd.count, 2);
			}, done);
		});
	});


	suite('merge', function () {

		test('does its job', function (done) {
			new RC().run(function () {
				var from = Item.create('apple', 5);
				var to = Item.create('apple', 1);
				var res = to.merge(from, 3);
				assert.strictEqual(res, 3);
				assert.strictEqual(from.count, 2);
				assert.strictEqual(to.count, 4);
				assert.isFalse(from.deleted);
				res = to.merge(from, 7);
				assert.strictEqual(res, 2);
				assert.strictEqual(from.count, 0);
				assert.strictEqual(to.count, 6);
				assert.isTrue(from.deleted);
			}, done);
		});

		test('respects max stack size', function (done) {
			new RC().run(function () {
				var from = Item.create('apple', 100);
				var to = Item.create('apple', 10);
				to.stackmax = 20;
				var res = to.merge(from, 100);
				assert.strictEqual(res, 10);
				assert.strictEqual(from.count, 90);
				assert.strictEqual(to.count, 20);
			}, done);
		});

		test('ignores attempts to merge into non-stack items', function (done) {
			new RC().run(function () {
				var it = new Item({class_tsid: 'trant_bean'});
				var res = it.merge(new Item({class_tsid: 'trant_bean'}), 1);
				assert.strictEqual(res, 0);
				assert.strictEqual(it.count, 1);
			}, done);
		});

		test('handles invalid arguments gracefully', function (done) {
			new RC().run(function () {
				var it = new Item({class_tsid: 'apple', count: 5});
				assert.strictEqual(it.merge(new Item({class_tsid: 'banana'}), 1), 0);
				assert.strictEqual(it.merge(new Item({class_tsid: 'trant_bean'}), 1), 0);
				assert.strictEqual(it.merge(new Item({class_tsid: 'apple'}), -3), 0);
				assert.strictEqual(it.merge(new Item({class_tsid: 'apple'}), 'foo'), 0);
				assert.strictEqual(it.count, 5);
			}, done);
		});

		test('does not merge items soulbound to different souls', function (done) {
			new RC().run(function () {
				var from = new Item({class_tsid: 'apple', count: 5, soulbound_to: 'me'});
				var to = new Item({class_tsid: 'apple', count: 5, soulbound_to: 'you'});
				assert.strictEqual(to.merge(from, 3), 0);
			}, done);
		});

		test('queues appropriate changes', function (done) {
			var rc = new RC();
			rc.run(function () {
				var p = new Player({tsid: 'PX', location: {tsid: 'LDUMMY'}});
				rc.cache[p.tsid] = p;  // add to RC cache so pers.get('PX') works
				var it = Item.create('meat', 5);
				it.tcont = p.tsid;
				it.merge(Item.create('meat', 2), 2);
				assert.lengthOf(p.changes, 1);
				var cd = p.changes[0].itemstack_values.pc[it.tsid];
				assert.strictEqual(cd.path_tsid, it.tsid);
				assert.strictEqual(cd.count, 7);
			}, done);
		});
	});


	suite('getChangeData', function () {

		test('works as expected (simple item)', function (done) {
			new RC().run(function () {
				var it = Item.create('meat', 7);
				assert.deepEqual(it.getChangeData(), {
					class_tsid: 'meat',
					count: 7,
					label: 'Meat',
					path_tsid: it.tsid,
					x: 0,
					y: 0,
				});
			}, done);
		});

		test('works as expected (tool)', function (done) {
			new RC().run(function () {
				var it = Item.create('high_class_hoe');
				var cd = it.getChangeData();
				assert.strictEqual(cd.class_tsid, 'high_class_hoe');
				assert.strictEqual(cd.count, 1);
				assert.strictEqual(cd.path_tsid, it.tsid);
				assert.isObject(cd.tool_state);
				assert.isBoolean(cd.tool_state.is_broken);
				assert.isNumber(cd.tool_state.points_capacity);
				assert.isNumber(cd.tool_state.points_remaining);
				assert.isString(cd.tooltip_label);
			}, done);
		});

		test('creates appropriate data for removed items', function (done) {
			new RC().run(function () {
				var it = Item.create('meat', 7);
				var cd = it.getChangeData(null, true);
				assert.strictEqual(cd.count, 0);
			}, done);
		});

		test('includes slot property (only if defined)', function (done) {
			new RC().run(function () {
				var it = Item.create('meat', 7);
				it.slot = 3;
				assert.strictEqual(it.getChangeData().slot, 3);
				it.slot = 0;
				assert.strictEqual(it.getChangeData().slot, 0);
				it.slot = undefined;
				assert.notProperty(it.getChangeData(), 'slot');
			}, done);
		});
	});


	suite('del', function () {

		test('queues appropriate changes', function (done) {
			var rc = new RC();
			rc.run(function () {
				var p = new Player({tsid: 'PX', location: {tsid: 'LDUMMY'}});
				rc.cache[p.tsid] = p;  // add to RC cache so pers.get('PX') works
				var it = new Item({tsid: 'IX', class_tsid: 'meat', tcont: 'PX'});
				it.container = p;
				p.items[it.tsid] = it;
				it.del();
				assert.lengthOf(p.changes, 1);
				var cd = p.changes[0].itemstack_values.pc[it.tsid];
				assert.strictEqual(cd.class_tsid, 'meat');
				assert.strictEqual(cd.path_tsid, it.tsid);
				assert.strictEqual(cd.count, 0);
			}, done);
		});
	});


	suite('setContainer', function () {

		test('queues appropriate changes', function (done) {
			var rc = new RC();
			rc.run(function () {
				var l = Location.create(Geo.create());
				var p = new Player({tsid: 'PX', location: l});
				var p2 = new Player({tsid: 'PY', location: l});
				l.players[p.tsid] = p;
				l.players[p2.tsid] = p2;
				rc.cache[p.tsid] = p;
				var it = new Item({tsid: 'IX', class_tsid: 'meat', tcont: l.tsid});
				it.setContainer(p);
				assert.lengthOf(p.changes, 2);
				var cd = p.changes[0].itemstack_values.location[it.tsid];
				assert.strictEqual(cd.path_tsid, it.tsid);
				assert.strictEqual(cd.count, 0, 'removed from location');
				cd = p.changes[1].itemstack_values.pc[it.tsid];
				assert.strictEqual(cd.path_tsid, it.tsid);
				assert.strictEqual(cd.count, 1, 'added to pc');
				// other player in loc is also notified of removal:
				assert.lengthOf(p2.changes, 1);
				cd = p2.changes[0].itemstack_values.location[it.tsid];
				assert.strictEqual(cd.path_tsid, it.tsid);
				assert.strictEqual(cd.count, 0, 'removed from location');
			}, done);
		});
	});
});
