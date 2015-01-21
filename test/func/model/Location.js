'use strict';

var path = require('path');
var pers = require('data/pers');
var persProxy = require('data/persProxy');
var RC = require('data/RequestContext');
var pbeMock = require('../../mock/pbe');
var Location = require('model/Location');
var Geo = require('model/Geo');
var Item = require('model/Item');
var Bag = require('model/Bag');
var Player = require('model/Player');
var gsjsBridge = require('model/gsjsBridge');
var utils = require('utils');


suite('Location', function () {

	setup(function () {
		// initialize gsjsBridge data structures (empty) without loading all the prototypes
		gsjsBridge.init(true);
		pers.init(pbeMock);
	});

	teardown(function () {
		// reset gsjsBridge so the cached prototypes don't influence other tests
		gsjsBridge.reset();
		pers.init();  // disable mock back-end
	});


	suite('Location/Geo integration', function () {

		this.timeout(10000);
		this.slow(4000);

		setup(function (done) {
			pers.init(pbeMock, {backEnd: {
				module: 'pbeMock',
				config: {pbeMock: {
					fixturesPath: path.resolve(path.join(__dirname, '../fixtures')),
				}}
			}}, done);
		});

		teardown(function () {
			pers.init();  // disable mock back-end
		});


		test('Location initialization does not flag Location or Geo as dirty',
			function (done) {
			var rc = new RC();
			rc.run(function () {
				var g = persProxy.makeProxy(new Geo({tsid: 'GX'}));
				persProxy.makeProxy(new Location({tsid: 'LX'}, g));
				assert.strictEqual(Object.keys(rc.dirty).length, 0);
			}, done);
		});

		test('geometry changes do not set dirty flag for Location', function (done) {
			var g = persProxy.makeProxy(new Geo(
				{tsid: 'GX', layers: {middleground: {doors: {}}}}));
			var l = persProxy.makeProxy(new Location({tsid: 'LX'}, g));
			var rc = new RC();
			rc.run(function () {
				l.geometry.layers.middleground.doors.d = {
					connect: {target: {label: 'china', tsid: 'LABC'}},
				};
				l.updateGeo();
				assert.deepEqual(Object.keys(rc.dirty), ['GX']);
			}, done);
		});

		test('replacing the whole geometry with a plain object is handled right',
			function (done) {
			// GSJS does that (loc.geometry = {})
			var g = new Geo({tsid: 'GX'});
			var l = new Location({tsid: 'LX'}, g);
			var rc = new RC();
			rc.run(function () {
				l.geometry = {something: 'foomp', tsid: 'GFOO'};
				l.updateGeo();
				// check that object was converted to Geo
				assert.instanceOf(l.geometry.__proxyTarget, Geo);
				assert.strictEqual(l.geometry.something, 'foomp');
				assert.strictEqual(l.geometry.tsid, 'GX',
					'TSID changed back according to Location TSID');
				// check that it will be persisted
				assert.deepEqual(Object.keys(rc.dirty), ['GX']);
				var newG = rc.dirty.GX;
				assert.instanceOf(newG.__proxyTarget, Geo);
				assert.strictEqual(newG.tsid, 'GX');
				assert.strictEqual(newG.something, 'foomp');
			}, done);
		});

		test('loading from persistence loads respective Geo object automatically',
			function (done) {
			new RC().run(function () {
				var l = pers.get('LLI32G3NUTD100I');
				assert.instanceOf(l.geometry, Geo);
				assert.strictEqual(l.geometry.tsid, 'GLI32G3NUTD100I');
				assert.strictEqual(l.geo.l, -3000);
				var door = l.clientGeometry.layers.middleground.doors.door_1300233269757;
				assert.strictEqual(door.connect.street_tsid, 'LCR177QO65T1EON');
				assert.isTrue(door.connect.target.__isORP);
				assert.strictEqual(pbeMock.getCounts().readSuccess, 4);
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
					assert.isTrue(l.__isPP);
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
				var p = new Player({tsid: 'PX', location: {tsid: l.tsid}});
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
	});


	suite('unload', function () {

		test('does its job', function (done) {
			var i1, i2, b, l;
			var rc = new RC();
			rc.run(
				function () {
					i1 = Item.create('apple');
					i2 = Item.create('banana');
					b = new Bag({class_tsid: 'bag_bigger_green', items: [i2]});
					l = Location.create(Geo.create());
					l.addItem(i1);
					l.addItem(b);
					l.unload();
				},
				function callback(err, res) {
					if (err) return done(err);
					assert.sameMembers(Object.keys(rc.unload),
						[i1.tsid, i2.tsid, b.tsid, l.geometry.tsid, l.tsid]);
					done();
				}
			);
		});
	});
});
