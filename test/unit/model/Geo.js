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
			ser.ts = getSampleData().ts;
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
});
