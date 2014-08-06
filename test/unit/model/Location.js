var util = require('util');
var Location = require('model/Location');


suite('Location', function() {

	suite('ctor', function() {
	
		test('initializes core properties', function() {
			var l = new Location();
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
			});
			assert.strictEqual(l.players.length, 2);
			assert.strictEqual(l.items.length, 3);
		});
	});
});
