'use strict';

var fs = require('fs');
var path = require('path');
var Geo = require('model/Geo');
var pers = require('data/pers');
var pbeMock = require('../../mock/pbe');


suite('Geo', function () {

	var FIXTURES_PATH = path.resolve(path.join(__dirname, '../fixtures'));

	function getSampleData() {
		var data = fs.readFileSync(path.join(FIXTURES_PATH, 'GLI32G3NUTD100I.json'));
		return JSON.parse(data);
	}

	setup(function () {
		pers.init(pbeMock);
	});

	teardown(function () {
		pers.init();  // disable mock back-end
	});


	suite('prepConnects', function () {

		test('prepares door/signpost connects', function () {
			var data = getSampleData();
			var g = new Geo(data);
			var c;
			for (var sp in g.layers.middleground.signposts) {
				for (var i in g.layers.middleground.signposts[sp].connects) {
					c = g.layers.middleground.signposts[sp].connects[i];
					assert.typeOf(c.label, 'string', sp);
					assert.typeOf(c.street_tsid, 'string', sp);
					assert.typeOf(c.target, 'object', sp);
				}
			}
			for (var k in g.layers.middleground.doors) {
				c = g.layers.middleground.doors[k].connect;
				assert.typeOf(c.label, 'string', k);
				assert.typeOf(c.street_tsid, 'string', k);
				assert.typeOf(c.target, 'object', k);
			}
		});

		test('does not fail on missing layer data', function () {
			var g = new Geo();
			assert.instanceOf(g, Geo);
			g = new Geo({layers: {}});
			assert.instanceOf(g, Geo);
			g = new Geo({layers: {middleground: {}}});
			assert.instanceOf(g, Geo);
		});

		test('does not fail with incomplete connects', function () {
			var g = new Geo({
				layers: {middleground: {doors: {
					d1: {connect: {  // no target
						hub_id: '58',
						mote_id: '9',
						swf_file_versioned: 'foo',
					}},
					d2: {connect: {  // incomplete/invalid target
						hub_id: '58',
						mote_id: '9',
						target: {},
					}},
				}}},
			});
			assert.property(g.layers.middleground.doors.d1.connect, 'hub_id');
			assert.property(g.layers.middleground.doors.d2.connect, 'hub_id');
			assert.property(g.layers.middleground.doors.d2.connect, 'target');
		});

		test('updates added connects', function () {
			var g = new Geo({
				layers: {middleground: {doors: {
					d: {connect: {
						target: {label: 'paris', tsid: 'LXYZ'},
					}},
				}}},
			});
			var before = g.layers.middleground.doors.d.connect;
			g.layers.middleground.doors.d2 = {
				connect: {target: {label: 'moscow', tsid: 'LZYX'}},
			};
			g.prepConnects();
			// updates new connect properly:
			var d2c = g.layers.middleground.doors.d2.connect;
			assert.strictEqual(d2c.label, 'moscow');
			assert.strictEqual(d2c.street_tsid, 'LZYX');
			assert.typeOf(d2c.target, 'object');
			assert.isFalse(d2c.propertyIsEnumerable('target'));
			// maintains existing connect:
			var dc = g.layers.middleground.doors.d.connect;
			assert.deepEqual(dc, before);
			assert.property(dc,
				'target', 'target still there');
			assert.isFalse(dc.propertyIsEnumerable('target'),
				'target still non-enumerable');
		});
	});


	suite('serialize', function () {

		test('works as expected', function () {
			var g = new Geo({
				layers: {middleground: {doors: {
					d: {connect: {
						target: {
							label: 'moon',
							tsid: 'LXYZ',
						},
						swf_file_versioned: 'foo',
					}},
				}}},
			});
			var ser = g.serialize();
			var dc = ser.layers.middleground.doors.d.connect;
			assert.notProperty(dc, 'label');
			assert.notProperty(dc, 'street_tsid');
			assert.property(dc, 'target');
			assert.isTrue(dc.propertyIsEnumerable('target'));
			assert.strictEqual(dc.target.label, 'moon');
			assert.strictEqual(dc.target.tsid, 'LXYZ');
		});

		test('returns data equivalent to original input data', function () {
			var ser = new Geo(getSampleData()).serialize();
			assert.deepEqual(ser, getSampleData());
		});

		test('does not modify instance data', function () {
			var g = new Geo({
				layers: {middleground: {doors: {
					d: {connect: {target: {
						label: 'moon',
						tsid: 'LXYZ',
					}}},
				}}},
			});
			g.serialize();
			var dc = g.layers.middleground.doors.d.connect;
			assert.strictEqual(dc.label, 'moon');
			assert.strictEqual(dc.street_tsid, 'LXYZ');
			assert.property(dc, 'target');
			assert.isFalse(dc.propertyIsEnumerable('target'));
		});

		test('makes a deep copy of the geo data', function () {
			// relevant for POL modifications, e.g. house expansion
			var src = new Geo(getSampleData());
			var ser = src.serialize();
			ser.layers.middleground.platform_lines.plat_SOMEFURNITUREITEM = {
				start: {x: 100, y: -123},
				emd: {x: 200, y: -123},
			};
			ser.layers.sky.w = -123;
			assert.notProperty(src.layers.middleground.platform_lines,
				'plat_SOMEFURNITUREITEM');
			assert.strictEqual(src.layers.sky.w, 4500);
		});
	});


	suite('getClientGeo', function () {

		test('does its job', function () {
			var g = new Geo(getSampleData());
			var mockLoc = {tsid: 'LLI32G3NUTD100I', label: 'Back Alley'};
			var cg = g.getClientGeo(mockLoc);
			assert.property(cg.layers.middleground, 'doors');
			assert.property(cg.layers.middleground, 'signposts');
			assert.notProperty(cg, 'serialize', 'does not contain functions');
			assert.strictEqual(cg.tsid, 'LLI32G3NUTD100I', 'has location TSID');
			assert.strictEqual(cg.label, 'Back Alley', 'has location label');
			cg.foo = 'doodle';
			assert.notProperty(g, 'foo', 'is a copy');
		});
	});


	suite('getGeo', function () {

		test('does its job', function () {
			var data = getSampleData();
			var cg = new Geo(data).getGeo();
			var props = ['l', 'r', 't', 'b', 'ground_y', 'swf_file'];
			for (var i = 0; i < props.length; i++) {
				assert.strictEqual(cg[props[i]], data[props[i]], props[i]);
			}
			assert.deepEqual(cg.sources, data.sources);
			assert.sameMembers(Object.keys(cg.signposts),
				Object.keys(data.layers.middleground.signposts));
			assert.sameMembers(Object.keys(cg.doors),
				Object.keys(data.layers.middleground.doors));
		});
	});


	suite('getClosestPlatPoint', function () {

		var plat1 = {
			start: {x: 10, y: 10},
			platform_item_perm: -1,  // -1 => solid from the top only
			platform_pc_perm: -1,
			end: {x: 20, y: 10},
		};
		var plat2 = {
			start: {x: 5, y: 30},
			platform_item_perm: null,  // null => solid from both sides
			platform_pc_perm: null,
			end: {x: 30, y: 30},
		};
		var plat3 = {
			start: {x: 15, y: 25},
			platform_item_perm: 1,
			platform_pc_perm: -1,
			end: {x: 35, y: 25},
		};
		var plat4 = {
			start: {x: 0, y: 5},
			platform_item_perm: 1,  // 1 => solid from the bottom only
			platform_pc_perm: 1,
			end: {x: 50, y: 5},
		};
		var g = new Geo({layers: {middleground: {platform_lines: {
			plat_1: plat1,
			plat_2: plat2,
			plat_3: plat3,
			plat_4: plat4,
		}}}});


		test('works as expected', function () {
			assert.deepEqual(g.getClosestPlatPoint(11, 11, 1),
				{point: {x: 11, y: 10}, plat: plat1});
			assert.deepEqual(g.getClosestPlatPoint(11, 11, -1),
				{point: {x: 11, y: 30}, plat: plat2});
			assert.deepEqual(g.getClosestPlatPoint(4, 11, -1),
				{point: undefined, plat: undefined});
			assert.deepEqual(g.getClosestPlatPoint(4, 11, 1),
				{point: undefined, plat: undefined});
			assert.deepEqual(g.getClosestPlatPoint(20, 20, 1),
				{point: {x: 20, y: 10}, plat: plat1});
			assert.deepEqual(g.getClosestPlatPoint(20, 20, -1),
				{point: {x: 20, y: 25}, plat: plat3});
		});

		test('works for items, too', function () {
			assert.deepEqual(g.getClosestPlatPoint(25, 15, -1, true),
				{point: {x: 25, y: 30}, plat: plat2},
				'item falls through plat3 (item_perm 1), lands on plat2');
			assert.deepEqual(g.getClosestPlatPoint(25, 15, -1),
				{point: {x: 25, y: 25}, plat: plat3},
				'PC lands on plat3 (pc_perm -1)');
		});
	});


	suite('getHitBoxes', function () {

		test('does its job', function () {
			var g = new Geo({
				layers: {
					middleground: {
						boxes: {
							foo: {w: 23, h: 13},
							bar: {w: 42, h: 12},
						},
					},
				},
			});
			var hitBoxes = g.getHitBoxes();
			assert.typeOf(hitBoxes, 'array');
			assert.lengthOf(hitBoxes, 2);
			assert.strictEqual(hitBoxes[0].w, 23, 'first box has correct width');
			assert.strictEqual(hitBoxes[0].h, 13, 'first box has correct height');
			assert.strictEqual(hitBoxes[1].w, 42, 'second box has correct width');
			assert.strictEqual(hitBoxes[1].h, 12, 'second box has correct height');
		});

		test('works if Geo does not contain any hitboxes', function () {
			assert.deepEqual(new Geo().getHitBoxes(), []);
		});
	});


	suite('limitX', function () {

		test('does its job', function () {
			var g = new Geo(getSampleData());
			assert.strictEqual(g.limitX(0), 0);
			assert.strictEqual(g.limitX(333.33), 333.33);
			assert.strictEqual(g.limitX(-3000), -2999);
			assert.strictEqual(g.limitX(-3000.1), -2999);
			assert.strictEqual(g.limitX(-Infinity), -2999);
			assert.strictEqual(g.limitX(12345), 2997);
			assert.isTrue(isNaN(g.limitX(NaN)), 'not trying to "fix" NaN here');
		});
	});


	suite('limitY', function () {

		test('does its job', function () {
			var g = new Geo(getSampleData());
			assert.strictEqual(g.limitY(0), 0);
			assert.strictEqual(g.limitY(-3000), -1000);
			assert.strictEqual(g.limitY(500), 0);
			assert.strictEqual(g.limitY(Infinity), 0);
			assert.isTrue(isNaN(g.limitY(NaN)), 'not trying to "fix" NaN here');
		});
	});


	suite('limitPath', function () {

		test('does its job', function () {
			var g = new Geo({l: 0, r: 200, b: 0, t: -100});
			var i = {x: 100, y: -10};  // mock item
			var p = {x: 300, y: -20};
			g.limitPath(i, p);
			assert.deepEqual(p, {x: 200, y: -15});
			p = {x: 201, y: 1};
			g.limitPath(i, p);
			assert.deepEqual(p, {x: 192, y: 0});
			p = {x: 110, y: 100};
			g.limitPath(i, p);
			assert.deepEqual(p, {x: 101, y: 0});
			p = {x: -100, y: 100};
			g.limitPath(i, p);
			assert.deepEqual(p, {x: 82, y: 0});
			p = {x: -1000, y: -50};
			g.limitPath(i, p);
			assert.deepEqual(p, {x: 0, y: -14});
			p = {x: -1, y: -1000};
			g.limitPath(i, p);
			assert.deepEqual(p, {x: 91, y: -100});
			p = {x: 101, y: -10000};
			g.limitPath(i, p);
			assert.deepEqual(p, {x: 100, y: -100});
			p = {x: 301, y: -999};
			g.limitPath(i, p);
			assert.deepEqual(p, {x: 118, y: -100});
			// inside geo boundaries, unchanged:
			p = {x: 150, y: -99};
			g.limitPath(i, p);
			assert.deepEqual(p, {x: 150, y: -99});
		});
	});
});
