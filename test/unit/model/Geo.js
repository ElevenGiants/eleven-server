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


	suite('ctor', function() {
	
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
});
