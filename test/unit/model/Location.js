'use strict';

var Location = require('model/Location');
var Geo = require('model/Geo');
var Item = require('model/Item');
var Bag = require('model/Bag');
var Player = require('model/Player');
var pers = require('data/pers');
var pbeMock = require('../../mock/pbe');
var RQ = require('data/RequestQueue');


suite('Location', function () {

	setup(function () {
		RQ.init();
	});

	teardown(function () {
		RQ.init();
	});


	function getDummyGeo() {
		// blank dummy object to prevent Location from trying to retrieve
		// geometry from persistence
		return new Geo();
	}


	suite('ctor', function () {

		test('initializes core properties', function () {
			var l = new Location({}, getDummyGeo());
			assert.deepEqual(l.players, {});
			assert.deepEqual(l.activePlayers, {});
			assert.deepEqual(l.items, {});
		});

		test('converts players and items lists to IdObjRefMaps', function () {
			var l = new Location({
				players: [
					{tsid: 'PX'},
					{tsid: 'PY'},
				],
				items: [
					{tsid: 'IA'},
					{tsid: 'IB'},
					{tsid: 'IC'},
				],
			}, getDummyGeo());
			assert.strictEqual(l.players.length, 2);
			assert.strictEqual(l.items.length, 3);
		});
	});


	suite('updateGeo', function () {

		setup(function () {
			pers.init(pbeMock);
		});

		teardown(function () {
			pers.init();  // disable mock back-end
		});

		test('does its job', function () {
			var l = new Location({}, new Geo({layers: {middleground: {doors: {}}}}));
			l.geometry.layers.middleground.doors.d = {
				connect: {target: {label: 'uranus', tsid: 'LABC'}},
			};
			l.geometry.l = -1234;
			l.updateGeo();
			var doors = l.geometry.layers.middleground.doors;
			assert.strictEqual(doors.d.connect.label, 'uranus');
			assert.strictEqual(doors.d.connect.street_tsid, 'LABC');
			assert.typeOf(doors.d.connect.target, 'object');
			assert.isFalse(doors.d.connect.propertyIsEnumerable('target'));
			assert.strictEqual(
				l.clientGeometry.layers.middleground.doors.d.connect.street_tsid,
				'LABC');
			assert.strictEqual(l.geo.doors.d.connect.street_tsid, 'LABC');
			assert.strictEqual(l.geo.l, -1234);
			// check that removing stuff also works:
			delete l.geometry.layers.middleground.doors.d;
			l.updateGeo();
			assert.notProperty(l.clientGeometry.layers.middleground.doors, 'd');
			assert.notProperty(l.geo.doors, 'd');
		});
	});


	suite('del', function () {

		test('works as expected', function () {
			var i = new Item({tsid: 'I1'});
			var b = new Bag({tsid: 'B1', items: [i]});
			i.container = b;
			var l = new Location({items: [b]}, new Geo());
			l.getRQ = function mockGetRQ() {
				return {
					push: function push() {},
				};
			};
			b.container = l;
			l.del();
			assert.isTrue(l.deleted);
			assert.isTrue(l.geometry.deleted);
			assert.isTrue(b.deleted);
			assert.isTrue(i.deleted);
		});

		test('fails if there are players in the location', function () {
			var p = new Player();
			var l = new Location({players: [p]}, new Geo());
			assert.throw(function () {
				l.del();
			}, assert.AssertionError);
		});
	});


	suite('queueAnnc', function () {

		test('works as expected', function () {
			var p1 = new Player();
			p1.session = {};  // dummy
			var p2 = new Player();
			p2.session = {};  // dummy
			var p3 = new Player();
			var l = new Location({players: [p1, p3]}, new Geo());
			l.queueAnnc({gargle: 'marbles'});
			assert.deepEqual(p1.anncs, [{gargle: 'marbles'}]);
			assert.deepEqual(p2.anncs, [], 'not queued for p2 (not in this loc)');
			assert.deepEqual(p3.anncs, [], 'not queued for p3 (not online/no session)');
		});
	});


	suite('send', function () {

		function dummyPlayer(tsid, results) {
			var p = new Player({tsid: tsid});
			p.send = function () {
				results.push(p.tsid);
			};
			return p;
		}

		test('works as expected', function () {
			var res = [];
			var l = new Location({players: [
				dummyPlayer('P1', res),
				dummyPlayer('P2', res),
				dummyPlayer('P3', res),
			]}, new Geo());
			l.players.P1.location = l;
			l.players.P2.location = l;
			l.players.P3.location = new Location({}, new Geo());  // some other loc
			l.send({});
			assert.deepEqual(res, ['P1', 'P2']);
			assert.sameMembers(Object.keys(l.players), ['P1', 'P2'],
				'P3 silently removed (because it is not actually in l)');
			res.length = 0;  // reset res
			l.send({}, false, ['P1', 'P4']);
			assert.deepEqual(res, ['P2']);
		});

		test('does not send changes to wrong player(s)', function () {
			var res = {};
			var p1 = new Player({tsid: 'P1'});
			var p2 = new Player({tsid: 'P2'});
			var mockSend = function (tsid, msg) {
				res[tsid] = msg;
			};
			p1.session = {send: mockSend.bind(null, p1.tsid)};
			p2.session = {send: mockSend.bind(null, p2.tsid)};
			var l = new Location({players: [p1, p2]}, new Geo());
			p1.location = l;
			p2.location = l;
			// simulate queued changes for P1:
			p1.getPropChanges = function () {
				return 'FAKE_PROP_CHANGES';
			};
			l.send({});
			assert.deepEqual(res.P1, {changes: {stat_values: 'FAKE_PROP_CHANGES'}});
			assert.deepEqual(res.P2, {}, 'changes for P1 not sent to P2');
		});
	});


	suite('getAllItems', function () {

		test('works as expected', function () {
			var i1 = new Item({tsid: 'I1'});
			var i3 = new Item({tsid: 'I3'});
			var i5 = new Item({tsid: 'I5'});
			var b3 = new Bag({tsid: 'B3', items: [i5]});
			var b2 = new Bag({tsid: 'B2', items: [b3], hiddenItems: [i3]});
			var l = new Location({tsid: 'L1', items: [i1, b2]}, new Geo());
			assert.deepEqual(l.getAllItems(true), {
				'I1': i1,
				'B2': b2,
				'B2/I3': i3,
				'B2/B3': b3,
				'B2/B3/I5': i5,
			});
			assert.deepEqual(l.getAllItems(), {
				'I1': i1,
				'B2': b2,
				// hidden item B2/I3 not included
				'B2/B3': b3,
				'B2/B3/I5': i5,
			});
		});
	});


	suite('getPath', function () {

		test('works as expected', function () {
			var i1 = new Item({tsid: 'I1'});
			var i2 = new Item({tsid: 'I2'});
			var i3 = new Item({tsid: 'I3'});
			var b = new Bag({tsid: 'B1', items: [i2], hiddenItems: [i1]});
			var l = new Location({tsid: 'L1', items: [b, i3]}, new Geo());
			assert.strictEqual(l.getPath('I3'), i3);
			assert.strictEqual(l.getPath('B1'), b);
			assert.strictEqual(l.getPath('B1/I1'), i1);
			assert.strictEqual(l.getPath('B1/I2'), i2);
			assert.isNull(l.getPath('BFOO/IBAR'), 'returns null if path not found');
			assert.isNull(l.getPath(), 'returns null for invalid argument');
		});
	});


	suite('sendItemStateChange', function () {

		test('works as expected', function (done) {
			var isend = new Item({tsid: 'ISEND'});
			isend.onContainerItemStateChanged = function () {
				throw new Error('should not be called');
			};
			var i1 = new Item({tsid: 'I1'});  // does not have an onContainerItemStateChanged function
			var i2 = new Item({tsid: 'I2'});
			i2.onContainerItemStateChanged = function (sender) {
				assert.strictEqual(sender.tsid, 'ISEND');
				done();
			};
			var l = new Location({tsid: 'L1', items: [i1, i2, isend]}, new Geo());
			l.sendItemStateChange(isend);
		});
	});


	suite('getInRadius', function () {

		test('works for items', function () {
			var l = new Location({items: [
				{tsid: 'I1', x: -10, y: -10},
				{tsid: 'I2', x: 15, y: 1},
				{tsid: 'I3', x: -10, y: 0},
				{tsid: 'I4', x: -10, y: -1},
				{tsid: 'I5', x: -7, y: -7},
				{tsid: 'I6', x: 7, y: -8},
				{tsid: 'I7', x: NaN, y: 0},
			]}, new Geo());
			var res = l.getInRadius(0, 0, 10);
			assert.deepEqual(res, {
				I3: {tsid: 'I3', x: -10, y: 0},
				I5: {tsid: 'I5', x: -7, y: -7},
			});
		});

		test('works for players', function () {
			var l = new Location({players: [
				{tsid: 'P1', x: 10, y: 10},
				{tsid: 'P2', x: 15, y: 10},
				{tsid: 'P3', x: 16, y: 10},
				{tsid: 'P4', x: 12, y: 13},
				{tsid: 'P5', x: 14, y: 13},  // just inside
				{tsid: 'P6', x: 13, y: 6},  // just inside
				{tsid: 'P7', x: 14, y: 6},  // just outside
			]}, new Geo());
			var res = l.getInRadius(10, 10, 5, true);
			assert.deepEqual(res, {
				P1: {tsid: 'P1', x: 10, y: 10},
				P2: {tsid: 'P2', x: 15, y: 10},
				P4: {tsid: 'P4', x: 12, y: 13},
				P5: {tsid: 'P5', x: 14, y: 13},
				P6: {tsid: 'P6', x: 13, y: 6},
			});
		});

		test('works for players (sorted)', function () {
			var l = new Location({players: [
				{tsid: 'P1', x: 10, y: 10},
				{tsid: 'P2', x: 15, y: 10},
				{tsid: 'P3', x: 16, y: 10},
				{tsid: 'P4', x: 12, y: 13},
				{tsid: 'P5', x: 14, y: 13},  // just inside
				{tsid: 'P6', x: 13, y: 6},  // just inside
				{tsid: 'P7', x: 14, y: 6},  // just outside
				{tsid: 'P8', x: 5, y: 5},
			]}, new Geo());
			var res = l.getInRadius(10, 10, 5, true, true);
			assert.deepEqual(res, [
				{pc: {tsid: 'P1', x: 10, y: 10}, dist: 0, x: 10, y: 10},
				{pc: {tsid: 'P4', x: 12, y: 13}, dist: Math.sqrt(13), x: 12, y: 13},
				{pc: {tsid: 'P2', x: 15, y: 10}, dist: 5, x: 15, y: 10},
				{pc: {tsid: 'P5', x: 14, y: 13}, dist: 5, x: 14, y: 13},
				{pc: {tsid: 'P6', x: 13, y: 6}, dist: 5, x: 13, y: 6},
			]);
		});
	});


	suite('getClosestItem', function () {

		var l = new Location({items: [
			{tsid: 'I1', class_tsid: 'C1', x: -10, y: -10},
			{tsid: 'I2', class_tsid: 'C2', x: 15, y: 1},
			{tsid: 'I3', class_tsid: 'C2', x: -10, y: 0},
			{tsid: 'I4', class_tsid: 'C3', x: -10, y: -1},
			{tsid: 'I5', class_tsid: 'C3', x: -7, y: -7},
			{tsid: 'I6', class_tsid: 'C3', x: 7, y: -8},
		]}, new Geo());

		test('works as intended without filter', function () {
			var res = l.getClosestItem(0, 0);
			assert.deepEqual(res, {tsid: 'I5', class_tsid: 'C3', x: -7, y: -7});
			res = l.getClosestItem(7, -5);
			assert.deepEqual(res, {tsid: 'I6', class_tsid: 'C3', x: 7, y: -8});
		});

		test('applies string filter', function () {
			var res = l.getClosestItem(0, 0, 'C2');
			assert.deepEqual(res, {tsid: 'I3', class_tsid: 'C2', x: -10, y: 0});
			res = l.getClosestItem(0, 0, 'C3');
			assert.deepEqual(res, {tsid: 'I5', class_tsid: 'C3', x: -7, y: -7});
		});

		test('applies function filter', function () {
			var res = l.getClosestItem(0, 0, function (i) {
				if (i.tsid === 'I1') {
					return true;
				}
			});
			assert.deepEqual(res, {tsid: 'I1', class_tsid: 'C1', x: -10, y: -10});
			var f = function (i, opt) {
				if (i.tsid === opt) {
					return true;
				}
			};
			res = l.getClosestItem(0, 0, f, 'I2');
			assert.deepEqual(res, {tsid: 'I2', class_tsid: 'C2', x: 15, y: 1});
		});
	});


	suite('gsOnPlayerEnter', function () {

		test('calls onEnter callbacks', function (done) {
			var itemOnPlayerEnterCalled = false;
			var locOnPlayerEnterCalled = false;
			var i = new Item({tsid: 'I'});
			var l = new Location({tsid: 'L', items: [i]}, new Geo());
			var p = new Player({tsid: 'P1', location: l});
			i.onPlayerEnter = function (player) {
				itemOnPlayerEnterCalled = true;
				assert.strictEqual(player, p);
				if (locOnPlayerEnterCalled) return done();
			};
			l.onPlayerEnter = function (player) {
				locOnPlayerEnterCalled = true;
				assert.strictEqual(player, p);
				if (itemOnPlayerEnterCalled) return done();
			};
			l.gsOnPlayerEnter(p);
		});
	});
});
