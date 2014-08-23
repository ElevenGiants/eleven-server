'use strict';

var util = require('util');
var Location = require('model/Location');
var Geo = require('model/Geo');


suite('Location', function() {

	function getDummyGeo() {
		// blank dummy object to prevent Location from trying to retrieve
		// geometry from persistence
		return new Geo();
	}


	suite('ctor', function() {
	
		test('initializes core properties', function() {
			var l = new Location({}, getDummyGeo());
			assert.deepEqual(l.players, {});
			assert.deepEqual(l.activePlayers, {});
			assert.deepEqual(l.items, {});
		});
		
		test('converts players and items lists to IdObjRefMaps', function() {
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
	
	
	suite('updateGeo', function() {
	
		test('does its job', function() {
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
			assert.strictEqual(l.clientGeometry.layers.middleground.doors.d.connect.street_tsid, 'LABC');
			assert.strictEqual(l.geo.doors.d.connect.street_tsid, 'LABC');
			assert.strictEqual(l.geo.l, -1234);
			// check that removing stuff also works:
			delete l.geometry.layers.middleground.doors.d;
			l.updateGeo();
			assert.notProperty(l.clientGeometry.layers.middleground.doors, 'd');
			assert.notProperty(l.geo.doors, 'd');
		});
	});
});
