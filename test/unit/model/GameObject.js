'use strict';

var GameObject = require('model/GameObject');
var RC = require('data/RequestContext');


suite('GameObject', function () {

	suite('ctor', function () {

		test('can instantiate new objects from scratch', function () {
			var go = new GameObject();
			assert.isString(go.tsid);
			assert.strictEqual(go.tsid[0], 'G');
			assert.isDefined(go.ts);
		});

		test('can instantiate new objects from existing data', function () {
			var go = new GameObject({
				tsid: 'GXYZ',
				class_tsid: 'something',
			});
			assert.strictEqual(go.tsid, 'GXYZ');
			assert.strictEqual(go.class_tsid, 'something');
			assert.strictEqual(go.id, 'GXYZ', 'deprecated property "id"');
			assert.strictEqual(go.class_id, 'something',
				'deprecated property "class_id"');
		});

		test('can instantiate with deprecated ID properties', function () {
			var go = new GameObject({
				id: 'GXYZ',
				class_id: 'something',
			});
			assert.strictEqual(go.tsid, 'GXYZ');
			assert.strictEqual(go.class_tsid, 'something');
		});

		test('restores serialized timers/intervals', function () {
			var go = new GameObject({
				gsTimers: {
					timer: {
						foo: 1,
						bar: 12,
					},
					interval: {
						someInt: {
							meh: true,
						},
					},
				},
			});
			assert.deepEqual(go.gsTimers.timer, {foo: 1, bar: 12});
			assert.deepEqual(go.gsTimers.interval, {someInt: {meh: true}});
		});
	});


	suite('serialize', function () {

		test('skips properties prefixed with "!"', function () {
			var go = new GameObject({
				tsid: 'GXYZ',
				'!excluded': 'x',
			});
			var ser = go.serialize();
			assert.strictEqual(ser.tsid, 'GXYZ');
			assert.notProperty(ser, '!excluded');
		});

		test('does not include function type properties', function () {
			var ser = new GameObject().serialize();
			assert.notProperty(ser, 'serialize');
		});

		test('returns data suitable to instantiate the object again', function () {
			var go = new GameObject({
				tsid: 'GXYZ',
			});
			go = new GameObject(go.serialize());
			assert.strictEqual(go.tsid, 'GXYZ');
		});

		test('does not include deprecated ID properties', function () {
			var go = new GameObject({
				id: 'GXYZ',
				class_id: 'something',
			});
			var ser = go.serialize();
			assert.strictEqual(ser.tsid, 'GXYZ');
			assert.strictEqual(ser.class_tsid, 'something');
			assert.notProperty(ser, 'id');
			assert.notProperty(ser, 'class_id');
		});

		test('includes timers&intervals', function () {
			var go = new GameObject();
			go.foo = function foo() {};
			go.foo2 = function foo2() {};
			go.setGsTimer({fname: 'foo', delay: 5});
			go.setGsTimer({fname: 'foo', delay: 10, interval: true});
			go.setGsTimer({fname: 'foo', delay: 15, multi: true});
			go.setGsTimer({fname: 'foo2', delay: 20, internal: true});
			var res = go.serialize().gsTimers;
			assert.strictEqual(res.timer.foo.options.delay, 5);
			assert.isTrue(res.timer.foo.start <= new Date().getTime());
			assert.notProperty(res.timer.foo, 'handle');
			assert.strictEqual(Object.keys(res.timer).length, 2,
				'one "regular" timer and one multi timer');
			assert.notProperty(res.timer, 'foo2', 'inernal timer not included');
			assert.strictEqual(res.interval.foo.options.delay, 10);
			assert.isTrue(res.interval.foo.start <= new Date().getTime());
			clearInterval(go.gsTimers.interval.foo.handle);  // clean up
		});
	});


	suite('del', function () {

		test('flags object for deletion', function () {
			var go = new GameObject();
			assert.property(go, 'deleted');
			assert.isFalse(go.deleted);
			go.del();
			assert.isTrue(go.deleted);
		});
	});


	suite('scheduleTimer', function () {

		test('does its job', function (done) {
			var go = new GameObject();
			go.foo = function foo(i) {
				assert.strictEqual(i, 3);
				assert.notProperty(go.gsTimers.timer, 'key', 'gsTimers entry removed');
				done();
			};
			go.gsTimers.timer.key = 'dummy';  // dummy gsTimers entry, just to check whether it is removed
			go.scheduleTimer({fname: 'foo', args: [3], delay: 30}, 'timer', 'key');
		});

		test('scheduled functions run in a RC', function (done) {
			var go = new GameObject();
			go.foo = function foo() {
				assert.isDefined(RC.getContext());
				assert.strictEqual(RC.getContext().owner, go);
				assert.strictEqual(RC.getContext().logtag, 'foo');
				done();
			};
			go.scheduleTimer({fname: 'foo'}, 'timer', 'key');
		});
	});


	suite('setGsTimer', function () {

		test('works as expected for regular timers', function () {
			var go = new GameObject({foo: function foo() {}});
			go.scheduleTimer = function verify(options, type, key) {
				assert.deepEqual(options,
					{fname: 'foo', args: ['x'], delay: 123});
				assert.strictEqual(type, 'timer');
				assert.strictEqual(key, 'foo');
				return 'zarg';
			};
			go.setGsTimer({fname: 'foo', args: ['x'], delay: 123});
			assert.deepEqual(go.gsTimers.interval, {});
			assert.strictEqual(go.gsTimers.timer.foo.options.fname, 'foo');
			assert.strictEqual(go.gsTimers.timer.foo.options.delay, 123);
			assert.deepEqual(go.gsTimers.timer.foo.options.args, ['x']);
			assert.strictEqual(go.gsTimers.timer.foo.handle, 'zarg');
			assert.isNumber(go.gsTimers.timer.foo.start);
		});

		test('works as expected for multi timers', function () {
			var go = new GameObject({foo: function foo() {}});
			go.scheduleTimer = function verify(options, type, key) {
				assert.deepEqual(options,
					{fname: 'foo', multi: true, delay: 1});
				assert.strictEqual(type, 'timer');
				assert.strictEqual(key.substr(0, 3), 'foo');
				assert.isTrue(key.length > 3);
			};
			go.setGsTimer({fname: 'foo', multi: true, delay: 1});
			assert.strictEqual(Object.keys(go.gsTimers.timer).length, 1);
			var key = Object.keys(go.gsTimers.timer)[0];
			assert.deepEqual(go.gsTimers.timer[key].options,
				{fname: 'foo', multi: true, delay: 1});
		});

		test('consecutively set multi timers have different keys', function () {
			var go = new GameObject({foo: function foo() {}});
			go.scheduleTimer = function dummy() {};
			go.setGsTimer({fname: 'foo', multi: true, delay: 1});
			go.setGsTimer({fname: 'foo', multi: true, delay: 1});
			assert.strictEqual(Object.keys(go.gsTimers.timer).length, 2);
			var keys = Object.keys(go.gsTimers.timer);
			assert.notStrictEqual(keys[0], keys[1]);
		});

		test('fails silently if timer already defined for the method', function () {
			var go = new GameObject({foo: function foo() {}});
			go.scheduleTimer = function dummy() {};
			go.setGsTimer({fname: 'foo', delay: 100});
			go.setGsTimer({fname: 'foo', delay: 100});
			assert.strictEqual(Object.keys(go.gsTimers.timer).length, 1);
		});

		test('works as expected for intervals', function () {
			var go = new GameObject({foo: function foo() {}});
			go.scheduleTimer = function verify(options, type, key) {
				assert.strictEqual(options.interval, true);
				assert.strictEqual(type, 'interval');
				assert.strictEqual(key, 'foo');
			};
			go.setGsTimer({fname: 'foo', interval: true, delay: 1000});
			assert.deepEqual(go.gsTimers.timer, {});
			assert.strictEqual(Object.keys(go.gsTimers.interval).length, 1);
			assert.deepEqual(go.gsTimers.interval.foo.options,
				{fname: 'foo', interval: true, delay: 1000});
		});

		test('fails with invalid options or option combinations', function () {
			assert.throw(function () {
				new GameObject().setGsTimer({fname: 'meh'});
			}, assert.AssertionError, 'no such function');
			assert.throw(function () {
				new GameObject().setGsTimer({fname: 'setGsTimer', multi: true,
					interval: true});
			}, assert.AssertionError, 'multi intervals not supported');
			assert.throw(function () {
				new GameObject().setGsTimer({fname: 'setGsTimer', multi: true,
					internal: true});
			}, assert.AssertionError, 'internal multi timers not supported');
		});
	});


	suite('gsTimerExists', function () {

		test('works as expected', function (done) {
			var calls = 0;
			var go = new GameObject();
			go.foo = function foo() {
				calls++;
				if (calls <= 1) {
					assert.isFalse(go.gsTimerExists('foo'),
						'one-off timer fired');
				}
				else {
					assert.isTrue(go.gsTimerExists('foo', true),
						'interval fired, but still enabled');
					clearInterval(go.gsTimers.interval.foo.handle);  // clean up
					done();
				}
			};
			go.setGsTimer({fname: 'foo', delay: 5});
			assert.isTrue(go.gsTimerExists('foo'), 'timer scheduled');
			go.setGsTimer({fname: 'foo', delay: 10, interval: true});
			assert.isTrue(go.gsTimerExists('foo', true), 'interval scheduled');
		});

		test('ignores multi timers', function () {
			var go = new GameObject({foo: function foo() {}});
			go.setGsTimer({fname: 'foo', delay: 5, multi: true});
			assert.isFalse(go.gsTimerExists('foo'));
		});
	});


	suite('suspendGsTimers', function () {

		test('works as expected', function (done) {
			var calls = 0;
			var go = new GameObject();
			go.foo = function foo(arg) {
				calls++;
				if (arg === 'fin') {
					assert.strictEqual(calls, 1);
					clearInterval(go.gsTimers.interval.foo.handle);  // clean up
					done();
				}
			};
			go.setGsTimer({fname: 'foo', delay: 5});
			go.setGsTimer({fname: 'foo', delay: 8, interval: true});
			setTimeout(function wait() {
				// give the timer/intervals a chance to fire, if they weren't really suspended
				go.foo('fin');
			}, 20);
			go.suspendGsTimers();
			assert.notProperty(go.gsTimers.timer.foo, 'handle');
			assert.notProperty(go.gsTimers.interval.foo, 'handle');
		});
	});


	suite('resumeGsTimers', function () {

		test('works as expected', function (done) {
			var now = new Date().getTime();
			var go = new GameObject();
			go.gsTimers = {
				timer: {
					obsolete: {
						options: {fname: 'foo', delay: 50},
						start: now - 100,
					},
					foo: {
						options: {fname: 'foo', delay: 20},
						start: now - 10,
					},
				},
				interval: {
					foo: {
						options: {fname: 'foo', delay: 20, interval: true},
						start: now - 99999,
					},
				},
			};
			var count = 0;
			go.foo = function foo() {
				count++;
				if (count === 2) {
					clearInterval(go.gsTimers.interval.foo.handle);  // clean up
					done();
				}
			};
			go.resumeGsTimers();
			assert.notProperty(go.gsTimers.timer, 'obsolete',
				'obsolete timer not resumed');
			assert.property(go.gsTimers.timer.foo, 'handle', 'timer resumed');
			assert.property(go.gsTimers.interval.foo, 'handle', 'interval resumed');
		});
	});


	suite('cancelGsTimer', function () {

		test('works as expected', function (done) {
			var go = new GameObject();
			var calls = 0;
			go.foo = function foo(arg) {
				calls++;
				// expecting the multi-timer call (not canceled) and the explicit "manual" call
				if (arg === 'fin') {
					assert.strictEqual(calls, 2);
					done();
				}
			};
			go.setGsTimer({fname: 'foo', delay: 5});
			go.setGsTimer({fname: 'foo', delay: 10, interval: true});
			go.setGsTimer({fname: 'foo', delay: 15, multi: true});
			go.cancelGsTimer('foo');
			go.cancelGsTimer('foo', true);
			assert.notProperty(go.gsTimers.timer, 'foo');
			assert.notProperty(go.gsTimers.interval, 'foo');
			setTimeout(function wait() {
				go.foo('fin');
			}, 20);
		});
	});


	suite('hasActiveGsTimers', function () {

		test('works with timers', function (done) {
			var go = new GameObject();
			assert.isFalse(go.hasActiveGsTimers());
			go.foo = function foo() {
				assert.isFalse(go.hasActiveGsTimers());
				done();
			};
			go.setGsTimer({fname: 'foo', delay: 10});
			assert.isTrue(go.hasActiveGsTimers());
		});

		test('works with intervals', function (done) {
			var go = new GameObject();
			assert.isFalse(go.hasActiveGsTimers());
			go.foo = function foo() {
				assert.isTrue(go.hasActiveGsTimers());
				go.cancelGsTimer('foo', true);
				assert.isFalse(go.hasActiveGsTimers());
				done();
			};
			go.setGsTimer({fname: 'foo', delay: 5, interval: true});
			assert.isTrue(go.hasActiveGsTimers());
		});
	});
});
