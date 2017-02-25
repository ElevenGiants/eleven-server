'use strict';

var _ = require('lodash');
var path = require('path');
var pers = require('data/pers');
var RC = require('data/RequestContext');
var RQ = require('data/RequestQueue');
var pbeMock = require('../../mock/pbe');
var Location = require('model/Location');
var Geo = require('model/Geo');
var Item = require('model/Item');
var Bag = require('model/Bag');
var gsjsBridge = require('model/gsjsBridge');
var utils = require('utils');
var helpers = require('../../helpers');


suite('Location', function () {

	setup(function () {
		// initialize gsjsBridge data structures (empty) without loading all the prototypes
		gsjsBridge.init(true);
		pers.init(pbeMock);
		RQ.init();
	});

	teardown(function () {
		// reset gsjsBridge so the cached prototypes don't influence other tests
		gsjsBridge.reset();
		pers.init();  // disable mock back-end
		RQ.init();
	});


	suite('Location/Geo integration', function () {

		this.timeout(10000);
		this.slow(4000);

		setup(function (done) {
			pers.init(pbeMock, {backEnd: {
				module: 'pbeMock',
				config: {pbeMock: {
					fixturesPath: path.resolve(path.join(__dirname, '../fixtures')),
				}},
			}}, done);
		});

		teardown(function () {
			pers.init();  // disable mock back-end
		});


		test('replacing the whole geometry with a plain object is handled right', function (done) {
			// GSJS does that (loc.geometry = {})
			var g = new Geo({tsid: 'GX'});
			var l = new Location({tsid: 'LX'}, g);
			var rc = new RC();
			rc.run(function () {
				l.geometry = {something: 'foomp', tsid: 'GFOO'};
				l.updateGeo();
				// check that object was converted to Geo
				assert.instanceOf(l.geometry, Geo);
				assert.strictEqual(l.geometry.something, 'foomp');
				assert.strictEqual(l.geometry.tsid, 'GX',
					'TSID changed back according to Location TSID');
			}, done);
		});

		test('loading from persistence loads respective Geo object automatically', function (done) {
			new RC().run(function () {
				var l = pers.get('LLI32G3NUTD100I');
				assert.instanceOf(l.geometry, Geo);
				assert.strictEqual(l.geometry.tsid, 'GLI32G3NUTD100I');
				assert.strictEqual(l.geo.l, -3000);
				var door = l.clientGeometry.layers.middleground.doors.door_1300233269757;
				assert.strictEqual(door.connect.street_tsid, 'LCR177QO65T1EON');
				assert.isTrue(door.connect.target.__isORP);
				assert.strictEqual(pbeMock.getCounts().readSuccess, 2);
				assert.strictEqual(pbeMock.getCounts().write, 0);
				assert.strictEqual(pbeMock.getCounts().del, 0);
			}, done);
		});
	});


	suite('create', function () {

		test('does its job and creates "town" by default', function (done) {
			new RC().run(
				function () {
					var g = Geo.create();
					var l = Location.create(g);
					assert.isTrue(utils.isLoc(l));
					assert.strictEqual(l.class_tsid, 'town');
					assert.strictEqual(l.tsid.substr(1), g.tsid.substr(1));
				},
				function cb(err, res) {
					if (err) return done(err);
					var db = pbeMock.getDB();
					assert.strictEqual(pbeMock.getCounts().write, 2);
					assert.strictEqual(Object.keys(db).length, 2);
					done();
				}
			);
		});

		test('fails if Geo object not available in persistence', function () {
			assert.throw(function () {
				new RC().run(function () {
					Location.create(new Geo());
				});
			}, assert.AssertionError);
		});
	});


	suite('gsOnLoad', function () {

		this.slow(1000);

		test('removes broken instance group references', function (done) {
			pbeMock.getDB().L1 = {tsid: 'L1', instances: {
				instances: {
					missing: [
						{objref: true, tsid: 'R0', label: 'bad instance group'},
					],
					somemissing: [
						{objref: true, tsid: 'R1', label: 'bad instance group'},
						{objref: true, tsid: 'R2', label: 'good instance group'},
					],
					notmissing: [
						{objref: true, tsid: 'R3', label: 'good instance group'},
					],
				},
			}};
			pbeMock.getDB().G1 = {tsid: 'G1'};
			pbeMock.getDB().R2 = {tsid: 'R2', label: 'good instance group'};
			pbeMock.getDB().R3 = {tsid: 'R3', label: 'good instance group'};
			new RC().run(function () {
				var inst = pers.get('L1').instances.instances;
				assert.deepEqual(Object.keys(inst), ['somemissing', 'notmissing']);
				assert.deepEqual(_.map(inst.somemissing, 'tsid'), ['R2']);
				assert.deepEqual(_.map(inst.notmissing, 'tsid'), ['R3']);
			}, done);
		});

		test('handles invalid/null references gracefully', function (done) {
			pbeMock.getDB().L1 = {tsid: 'L1', instances: {
				instances: {
					somebroken: [
						{objref: true, tsid: 'R0', label: 'good instance group'},
						null,
					],
				},
			}};
			pbeMock.getDB().G1 = {tsid: 'G1'};
			pbeMock.getDB().R0 = {tsid: 'R0', label: 'good instance group'};
			new RC().run(function () {
				var inst = pers.get('L1').instances.instances;
				assert.deepEqual(Object.keys(inst), ['somebroken']);
				assert.deepEqual(_.map(inst.somebroken, 'tsid'), ['R0']);
			}, done);
		});
	});


	suite('addItem', function () {

		test('does its job', function (done) {
			new RC().run(function () {
				var l = Location.create(Geo.create());
				var i = Item.create('apple', 5);
				l.addItem(i, 123, -456);
				assert.strictEqual(l.items[i.tsid], i);
				assert.strictEqual(i.container, l);
				assert.strictEqual(i.tcont, l.tsid);
				assert.isUndefined(i.slot);
				assert.strictEqual(i.x, 123);
				assert.strictEqual(i.y, -456);
			}, done);
		});

		test('creates correct changes when player drops bag', function (done) {
			var rc = new RC();
			rc.run(function () {
				// setup (create/initialize loc, player, bag)
				var l = Location.create(Geo.create());
				var p = helpers.getOnlinePlayer({tsid: 'PX', location: {tsid: l.tsid}});
				l.players = {PX: p};  // put player in loc (so loc changes are queued for p)
				rc.cache[p.tsid] = p;  // required so b.tcont can be "loaded" from persistence
				var b = new Bag({tsid: 'BX', class_tsid: 'bag_bigger_green'});
				b.container = p;
				b.tcont = p.tsid;
				// test starts here
				l.addItem(b, 100, 200);
				assert.strictEqual(p.changes.length, 2);
				var pcChg = p.changes[0].itemstack_values.pc.BX;
				var locChg = p.changes[1].itemstack_values.location.BX;
				assert.strictEqual(pcChg.count, 0);
				assert.strictEqual(locChg.count, 1);
				assert.strictEqual(locChg.x, 100);
				assert.strictEqual(locChg.y, 200);
			}, done);
		});
		
		test('merge stacks where possible', function (done) {
			var rc = new RC();
			rc.run(function () {
				var l = Location.create(Geo.create());
				var i1 = Item.create('apple', 50);
				var i2 = Item.create('apple', 82);
				var i3 = Item.create('apple', 30);
				l.addItem(i1, 0, 0);
				l.addItem(i2, 10, 10);
				l.addItem(i3, 100, 100);
				assert.strictEqual(i1.count, 100);
				assert.strictEqual(i2.count, 32);
				assert.strictEqual(i3.count, 30);
			}, done);
		});
	});


	suite('unload', function () {

		this.slow(1000);

		test('does its job', function (done) {
			var i1, i2, b, l, g;
			var rc = new RC();
			var unloadCount = 0;
			rc.run(
				function () {
					g = Geo.create();
					l = Location.create(g);
					i1 = Item.create('apple');
					l.addItem(i1, 12, 13);
					i2 = Item.create('banana');
					b = Bag.create('bag_bigger_green');
					l.addItem(b, 12, 13);
					b.addToSlot(i2, 0);
					l.suspendGsTimers = g.suspendGsTimers = b.suspendGsTimers =
						i1.suspendGsTimers = i2.suspendGsTimers = function check() {
							unloadCount++;
						};
					var rq = l.getRQ();
					l.unload(function (err) {
						if (err) return done(err);
						assert.isTrue(rq.closing);
					});
				}
			);
			// RQ is closed asynchronously in rq.next, so defer the rest of the test a bit
			setTimeout(function checkRqShutown() {
				assert.strictEqual(unloadCount, 5);
				assert.isUndefined(RQ.get(l.tsid, true));
				done();
			}, 100);
		});
	});


	suite('copy', function () {

		test('does its job', function (done) {
			new RC().run(function () {
				var src = new Location({instance_me: 'foo'},
					new Geo({layers: {middleground: {}}}));
				var copy = Location.copy(src, {label: 'Test Label',
					moteId: 'Mote Test', hubId: 'Hub Test', isInstance: true,
					classTsid: 'home'});
				assert.notEqual(copy.geometry.layers.middleground, undefined);
				assert.strictEqual(copy.label, 'Test Label');
				assert.strictEqual(copy.moteid, 'Mote Test');
				assert.strictEqual(copy.hubid, 'Hub Test');
				assert.isTrue(copy.is_instance);
				assert.strictEqual(copy.class_tsid, 'home');
				assert.strictEqual(copy.instance_of, src.tsid);
			}, done);
		});

		test('copies items', function (done) {
			var rc = new RC();
			rc.run(function () {
				var geo = new Geo({layers: {middleground: {doors: {d: {connect:
					{target: {label: 'uranus', tsid: 'LABC'}}}}}}});
				var l = new Location({instance_me: 'foo'}, geo);
				rc.cache[l.tsid] = l;  // required so l can be "loaded" from persistence
				var i = Item.create('apple');
				l.addItem(i, 12, 13);
				var copy = Location.copy(l, {label: 'Label', moteId: 'Mote',
					hubId: 'Hub', isIstance: true, classTsid: 'home'});
				var icopy = copy.items[Object.keys(copy.items)[0]];
				assert.strictEqual(icopy.class_tsid, 'apple');
				assert.strictEqual(icopy.x, 12);
				assert.strictEqual(icopy.y, 13);
				assert.notStrictEqual(icopy, i);
			}, done);
		});
	});
});
