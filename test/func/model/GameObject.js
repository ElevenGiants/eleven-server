'use strict';

var fs = require('fs');
var path = require('path');
var GameObject = require('model/GameObject');


suite('GameObject', function () {
	
	var FIXTURES_PATH = path.resolve(path.join(__dirname, '../fixtures'));
	
	function getFixtureJson(fname) {
		var data = fs.readFileSync(path.join(FIXTURES_PATH, fname));
		return JSON.parse(data);
	}
	

	suite('game object loading/initialization', function () {
	
		test('converts "dynamic" portion of input data', function () {
			var go = new GameObject(getFixtureJson('GIFPV9EMLT72DP4.json'));
			assert.strictEqual(go.tsid, 'GIFPV9EMLT72DP4');
			assert.notProperty(go, 'dynamic');
			assert.property(go, 'layers');
		});
		
		test('keeps timestamp from data if there is one', function () {
			var data = getFixtureJson('GIFPV9EMLT72DP4.json');
			var go = new GameObject(data);
			assert.strictEqual(go.ts, data.ts);
		});
	});
	
	
	suite('preparation for serialization', function () {
	
		test('serialized data is equivalent to source data', function () {
			var data = getFixtureJson('IHFK8C8NB6J2FJ5.json');
			var go = new GameObject(data);
			assert.deepEqual(go.serialize(), data);
		});
	});
});
