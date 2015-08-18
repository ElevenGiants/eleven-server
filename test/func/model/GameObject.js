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
					delete go.gsTimers.intTest;  // clean up
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

		test('timers on stale objects are not executed', function (done) {
			var go = new GameObject();
			var called = false;
			go.foo = function () {
				called = true;
			};
			go.setGsTimer({fname: 'foo', delay: 5});
			setTimeout(function () {
				assert.isTrue(go.stale);
				assert.isFalse(called);
				done();
			}, 10);
			go.stale = true;
		});

		test('intervals on stale objects are cleared', function (done) {
			var go = new GameObject();
			var calledOnStale = false;
			var c = 0;
			go.foo = function () {
				c++;
				if (go.stale) calledOnStale = true;
				go.stale = true;
			};
			go.setGsTimer({fname: 'foo', delay: 5, interval: true});
			setTimeout(function () {
				assert.isTrue(go.stale);
				assert.strictEqual(c, 1);
				assert.isFalse(calledOnStale);
				done();
			}, 20);
		});

		test('timers/intervals are persistently removed after errors', function (done) {
			var go = new GameObject();
			var c = 0;
			go.foo = function () {
				throw new Error('something went wrong here');
			};
			go.bar = function () {
				c++;
				throw new Error('something went wrong here too');
			};
			go.setGsTimer({fname: 'foo', delay: 5});
			go.setGsTimer({fname: 'bar', delay: 5, interval: true});
			assert.property(go.gsTimers, 'foo');
			setTimeout(function () {
				assert.notProperty(go.gsTimers, 'foo',
					'timer removed in spite of an execution error');
				assert.notProperty(go.gsTimers, 'bar',
					'interval removed in spite of an execution error');
				assert.strictEqual(c, 1, 'interval only executed once');
				done();
			}, 20);
		});
	});
});
