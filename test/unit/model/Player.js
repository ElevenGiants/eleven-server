var Property = require('model/Property');
var Player = require('model/Player');


suite('Player', function() {

	suite('ctor', function() {
	
		test('TSIDs of new Player objects start with P', function() {
			assert.strictEqual(new Player().tsid[0], 'P');
		});
		
		test('properties are initialized properly', function() {
			var p = new Player({tsid: 'P1', metabolics: {energy: 7000}});
			assert.instanceOf(p.metabolics.energy, Property);
			assert.strictEqual(p.metabolics.energy.value, 7000);
			p = new Player({tsid: 'P1', metabolics: {
				energy: {value: 50, bottom: 0, top: 800, label: 'energy'}},
			});
			assert.instanceOf(p.metabolics.energy, Property);
			assert.strictEqual(p.metabolics.energy.value, 50);
			assert.strictEqual(p.metabolics.energy.bottom, 0);
			assert.strictEqual(p.metabolics.energy.top, 800);
		});
		
		test('missing properties are created', function() {
			var p = new Player();
			assert.strictEqual(p.metabolics.energy.value, 0);
			assert.strictEqual(p.stats.xp.value, 0);
			assert.strictEqual(p.daily_favor.ti.value, 0);
		});
	});
	
	
	suite('serialize', function() {
	
		test('properties are serialized as full objects', function() {
			var p = new Player({tsid: 'P1', stats: {xp: 23}});
			var data = JSON.parse(JSON.stringify(p.serialize()));
			assert.deepEqual(data.stats.xp,
				{value: 23, bottom: 23, top: 23, label: 'xp'});
		});
	});
});
