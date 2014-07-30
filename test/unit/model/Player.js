var Player = require('model/Player');


suite('Player', function() {

	suite('ctor', function() {
	
		test('TSIDs of new Player objects start with P', function() {
			assert.strictEqual(new Player().tsid[0], 'P');
		});
	});
});
