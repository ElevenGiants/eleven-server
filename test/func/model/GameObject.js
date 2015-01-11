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


	suite('timers', function () {

		test('basic timer call', function (done) {
			var go = new GameObject();
			var called = false;
			go.timerTest = function timerTest(arg) {
				called = true;
				assert.strictEqual(arg, 'grunt');
				done();
			};
			go.setGsTimer({
				fname: 'timerTest',
				delay: 10,
				args: ['grunt'],
			});
			assert.isFalse(called);
		});

		test('basic interval call', function (done) {
			var go = new GameObject();
			var calls = 0;
			go.intTest = function intTest() {
				calls++;
				if (calls === 3) {
					clearInterval(go.gsTimers.interval.intTest.handle);  // clean up
					done();
				}
			};
			go.setGsTimer({
				fname: 'intTest',
				delay: 5,
				interval: true,
			});
			assert.strictEqual(calls, 0);
		});
	});
});
