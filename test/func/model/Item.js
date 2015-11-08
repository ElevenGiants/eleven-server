'use strict';

var gsjsBridge = require('model/gsjsBridge');
var RC = require('data/RequestContext');
var RQ = require('data/RequestQueue');
var Item = require('model/Item');
var Bag = require('model/Bag');
var Player = require('model/Player');
var Location = require('model/Location');
var Geo = require('model/Geo');
var pers = require('data/pers');
var utils = require('utils');
var pbeMock = require('../../mock/pbe');
var helpers = require('../../helpers');


suite('Item', function () {

	setup(function () {
		gsjsBridge.init(true);
		pers.init(pbeMock);
		RQ.init();
	});

	teardown(function () {
		gsjsBridge.reset();
		pers.init();  // disable mock back-end
		RQ.init();
	});


	suite('create', function () {

		test('does its job', function (done) {
			new RC().run(
				function () {
					var it = Item.create('pi', 7);
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


	suite('delete', function () {

		this.slow(400);

		test('forces container to be persisted after the request', function (done) {
			var rc = new RC();
			var l;
			rc.run(
				function () {
					l = Location.create(Geo.create());
					rc.cache[l.tsid] = l;
					var it = Item.create('meat', 7);
					it.setContainer(l, 100, 100);
					assert.deepEqual(Object.keys(l.items), [it.tsid]);
					it.del();
				},
				function cb(err) {
					if (err) return done(err);
					var db = pbeMock.getDB();
					assert.strictEqual(pbeMock.getCounts().write, 2);  // geo and loc
					assert.strictEqual(pbeMock.getCounts().del, 1);
					assert.sameMembers(Object.keys(db), [l.tsid, l.geometry.tsid]);
					assert.deepEqual(Object.keys(l.items), []);
					done();
				},
				true
			);
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
				var p = helpers.getOnlinePlayer(
					{tsid: 'PX', location: {tsid: 'LDUMMY'}});
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
				var p = helpers.getOnlinePlayer(
					{tsid: 'PX', location: {tsid: 'LDUMMY'}});
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
			var rc = new RC();
			rc.run(function () {
				var p = new Player({tsid: 'PX', location: {tsid: 'LDUMMY'}});
				var l = Location.create({geo: Geo.create()});
				rc.cache[p.tsid] = p;
				var it = Item.create('meat', 7);
				it.setContainer(p, 3);
				assert.strictEqual(it.getChangeData().slot, 3);
				it.x = 0;
				assert.strictEqual(it.getChangeData().slot, 0);
				it.setContainer(l, 1, 2);
				assert.notProperty(it.getChangeData(), 'slot');
			}, done);
		});

		test('creates compact change set if desired', function (done) {
			new RC().run(function () {
				var it = Item.create('npc_piggy');
				var cd = it.getChangeData(null, false, true);
				assert.deepEqual(cd, {
					x: 0,
					y: 0,
					s: 'look_screen',
				});
			}, done);
		});

		test('does not fail on furniture bag deletion', function (done) {
			var rc = new RC();
			rc.run(function () {
				var p = new Player({tsid: 'PX', location: {tsid: 'LDUMMY'}});
				rc.cache[p.tsid] = p;
				var b = Bag.create('bag_furniture_smallcabinet');
				b.setContainer(p, 0, -1, true);
				b.del();
				b.getChangeData();
			}, done);
		});
	});


	suite('del', function () {

		test('queues appropriate changes', function (done) {
			var rc = new RC();
			rc.run(function () {
				var p = helpers.getOnlinePlayer(
					{tsid: 'PX', location: {tsid: 'LDUMMY'}});
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
				var l = Location.create({geo: Geo.create()});
				var p = helpers.getOnlinePlayer({tsid: 'PX', location: l});
				var p2 = helpers.getOnlinePlayer({tsid: 'PY', location: l});
				l.players[p.tsid] = p;
				l.players[p2.tsid] = p2;
				rc.cache[p.tsid] = p;
				var it = new Item({tsid: 'IX', class_tsid: 'meat',
					tcont: l.tsid, container: l});
				it.setContainer(p, 0);
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

		test('does not queue changes for hidden items', function (done) {
			var rc = new RC();
			rc.run(function () {
				// setup
				var l = Location.create({geo: Geo.create()});
				var p1 = helpers.getOnlinePlayer({tsid: 'P1', location: l});
				rc.cache[p1.tsid] = p1;
				var p2 = helpers.getOnlinePlayer({tsid: 'P2', location: l});
				rc.cache[p2.tsid] = p2;
				// test adding hidden item (regular case)
				var i1 = new Item({tsid: 'I1'});
				i1.setContainer(p1, 1, 2, true);
				assert.lengthOf(p1.changes, 0, 'no changes queued for hidden item');
				// test hiding previously non-hidden item
				var i2 = new Item({tsid: 'I2'});
				i2.setContainer(p2, 1, 2);
				p2.changes = [];  // reset (just testing what comes next)
				i2.setContainer(p1, 1, 2, true);
				assert.lengthOf(p2.changes, 1,
					'change queued for removal of not yet hidden item');
				assert.lengthOf(p1.changes, 0,
					'no changes queued for now hidden item');
			}, done);
		});

		test('does not queue removal change when moving within same container',
			function (done) {
			var rc = new RC();
			rc.run(function () {
				// setup (item in a bag in player inventory)
				var p = new Player({tsid: 'PX'});
				p.queueChanges = function noop() {};
				var it = new Item({tsid: 'IT'});
				var b = new Bag({tcont: 'PX'});
				rc.cache[p.tsid] = p;
				rc.cache[b.tsid] = b;
				it.setContainer(b, 1);  // not interested in the changes for this
				// aggregator for queued changes
				var changes = [];
				it.queueChanges = function queueChanges(removed) {
					changes.push(removed);
				};
				// actual test starts here
				it.setContainer(b, 2);
				assert.deepEqual(changes, [undefined]);
			}, done);
		});

		test('sends removal changes to previous top container', function (done) {
			var l = new Location({tsid: 'LX'}, new Geo());
			var p = helpers.getOnlinePlayer({tsid: 'PX', location: l});
			l.players = {PX: p};
			var b = new Bag({tsid: 'BX', container: l, tcont: l.tsid});
			var it = new Item({tsid: 'IT', container: b, tcont: l.tsid});
			b.items = {IT: it};
			var rc = new RC();
			rc.run(function () {
				rc.cache[p.tsid] = p;
				rc.cache[l.tsid] = l;
				b.setContainer(p, 0);  // changing container from loc to player in loc
				var changes = p.mergeChanges().itemstack_values;
				assert.lengthOf(Object.keys(changes.pc), 2,
					'pc addition changes for both bag and item');
				assert.strictEqual(changes.pc.BX.count, 1);
				assert.strictEqual(changes.pc.IT.count, 1);
				assert.lengthOf(Object.keys(changes.location), 2,
					'loc removal changes for both bag and item');
				assert.strictEqual(changes.location.BX.count, 0);
				assert.strictEqual(changes.location.IT.count, 0);
			}, done);
		});
	});


	suite('setXY', function () {

		var geoData = {layers: {middleground: {platform_lines: {
			plat1: {
				start: {x: 100, y: -10},
				platform_item_perm: -1,
				end: {x: 200, y: -20},
			},
			plat2: {
				start: {x: 100, y: -30},
				platform_item_perm: 1,  // items fall through
				end: {x: 200, y: -50},
			},
		}}}};

		test('honors Newton', function (done) {
			new RC().run(function () {
				var l = Location.create({geo: Geo.create(geoData)});
				var it = Item.create('pi');
				it.setContainer(l, 150, -25);  // calls setXY internally
				assert.strictEqual(it.x, 150);
				assert.strictEqual(it.y, -15, 'placed in the middle of plat1');
				it.setXY(150, -100);
				assert.strictEqual(it.y, -15, 'fell through permeable plat2');
				it.setXY(300, -234);
				assert.strictEqual(it.x, 300);
				assert.strictEqual(it.y, -234, 'no plat found, y unchanged');
			}, done);
		});

		test('ignores Newton for items that do not obey physics', function (done) {
			new RC().run(function () {
				var l = Location.create({geo: Geo.create(geoData)});
				var it = Item.create('bunch_of_grapes_hell');
				it.setContainer(l, 150, -25);  // calls setXY internally
				assert.strictEqual(it.y, -25, 'item does not obey physics, y unchanged');
			}, done);
		});
	});
});
