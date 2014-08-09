var fs = require('fs');
var path = require('path');
var util = require('util');
var Geo = require('model/Geo');


suite('Geo', function() {

	var FIXTURES_PATH = path.resolve(path.join(__dirname, '../fixtures'));

	function getSampleData() {
		var data = fs.readFileSync(path.join(FIXTURES_PATH, 'GLI32G3NUTD100I.json'));
		return JSON.parse(data);
	}


	suite('prepConnects', function() {
	
		test('prepares door/signpost connects', function() {
			var data = getSampleData();
			var g = new Geo(data);
			for (var sp in g.layers.middleground.signposts) {
				for (var i in g.layers.middleground.signposts[sp].connects) {
					var c = g.layers.middleground.signposts[sp].connects[i];
					assert.typeOf(c.label, 'string', sp);
					assert.typeOf(c.street_tsid, 'string', sp);
					assert.typeOf(c.target, 'object', sp);
				}
			}
			for (var k in g.layers.middleground.doors) {
				var c = g.layers.middleground.doors[k].connect;
				assert.typeOf(c.label, 'string', k);
				assert.typeOf(c.street_tsid, 'string', k);
				assert.typeOf(c.target, 'object', k);
			}
		});
		
		test('does not fail on missing layer data', function() {
			var g = new Geo();
			assert.instanceOf(g, Geo);
			g = new Geo({layers: {}});
			assert.instanceOf(g, Geo);
			g = new Geo({layers: {middleground: {}}});
			assert.instanceOf(g, Geo);
		});
		
		test('does not fail with incomplete connects', function() {
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
		
		test('updates added connects', function() {
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
			assert.strictEqual(g.layers.middleground.doors.d2.connect.label, 'moscow');
			assert.strictEqual(g.layers.middleground.doors.d2.connect.street_tsid, 'LZYX');
			assert.typeOf(g.layers.middleground.doors.d2.connect.target, 'object');
			assert.isFalse(g.layers.middleground.doors.d2.connect.propertyIsEnumerable('target'));
			// maintains existing connect:
			assert.deepEqual(g.layers.middleground.doors.d.connect, before);
			assert.property(g.layers.middleground.doors.d.connect,
				'target', 'target still there');
			assert.isFalse(g.layers.middleground.doors.d.connect.propertyIsEnumerable('target'),
				'target still non-enumerable');
		});
	});
	

	suite('serialize', function() {
	
		test('works as expected', function() {
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
			assert.notProperty(ser.layers.middleground.doors.d.connect, 'label');
			assert.notProperty(ser.layers.middleground.doors.d.connect, 'street_tsid');
			assert.property(ser.layers.middleground.doors.d.connect, 'target');
			assert.isTrue(ser.layers.middleground.doors.d.connect.propertyIsEnumerable('target'));
			assert.strictEqual(ser.layers.middleground.doors.d.connect.target.label, 'moon');
			assert.strictEqual(ser.layers.middleground.doors.d.connect.target.tsid, 'LXYZ');
		});
		
		test('returns data equivalent to original input data', function() {
			var ser = new Geo(getSampleData()).serialize();
			assert.deepEqual(ser, getSampleData());
		});
		
		test('does not modify instance data', function() {
			var g = new Geo({
				layers: {middleground: {doors: {
					d: {connect: {target: {
						label: 'moon',
						tsid: 'LXYZ',
					}}},
				}}},
			});
			g.serialize();
			assert.strictEqual(g.layers.middleground.doors.d.connect.label, 'moon');
			assert.strictEqual(g.layers.middleground.doors.d.connect.street_tsid, 'LXYZ');
			assert.property(g.layers.middleground.doors.d.connect, 'target');
			assert.isFalse(g.layers.middleground.doors.d.connect.propertyIsEnumerable('target'));
		});
	});
	
	
	suite('getClientGeo', function() {
	
		test('does its job', function() {
			var g = new Geo(getSampleData());
			var cg = g.getClientGeo();
			assert.property(cg.layers.middleground, 'doors');
			assert.property(cg.layers.middleground, 'signposts');
			assert.notProperty(cg, 'serialize', 'does not contain functions');
			assert.strictEqual(cg.tsid, 'LLI32G3NUTD100I', 'has location TSID');
			cg.foo = 'doodle';
			assert.notProperty(g, 'foo', 'is a copy');
		});
	});
	
	
	suite('getGeo', function() {
	
		test('does its job', function() {
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
