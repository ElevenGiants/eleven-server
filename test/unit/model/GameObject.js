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
					foo: 1,
					bar: 12,
					someInt: {
						meh: true,
					},
				},
			});
			assert.deepEqual(go.gsTimers, {foo: 1, bar: 12, someInt: {meh: true}});
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
			go.ifoo = function ifoo() {};
			go.foo2 = function foo2() {};
			go.setGsTimer({fname: 'foo', delay: 5});
			go.setGsTimer({fname: 'ifoo', delay: 10, interval: true});
			go.setGsTimer({fname: 'foo', delay: 15, multi: true});
			go.setGsTimer({fname: 'foo2', delay: 20, internal: true});
			var res = go.serialize().gsTimers;
			assert.strictEqual(res.foo.options.delay, 5);
			assert.isTrue(res.foo.start <= new Date().getTime());
			assert.notProperty(res.foo, 'handle');
			assert.lengthOf(Object.keys(res), 3,
				'one "regular" timer, one multi timer and one interval');
			assert.notProperty(res, 'foo2', 'internal timer not included');
			assert.strictEqual(res.ifoo.options.delay, 10);
			assert.isTrue(res.ifoo.start <= new Date().getTime());
			go.cancelGsTimer('ifoo', true);  // clean up
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
				assert.notProperty(go.gsTimers, 'key', 'gsTimers entry removed');
				done();
			};
			go.gsTimers.key = 'dummy';  // dummy gsTimers entry, just to check whether it is removed
			go.scheduleTimer({fname: 'foo', args: [3], delay: 30}, 'key');
		});

		test('scheduled functions run in a RC', function (done) {
			var go = new GameObject();
			go.foo = function foo() {
				assert.isDefined(RC.getContext());
				assert.strictEqual(RC.getContext().logtag, 'foo');
				done();
			};
			go.scheduleTimer({fname: 'foo'}, 'key');
		});

		test('clamps delay to maximum possible value', function (done) {
			var go = new GameObject();
			var called = false;
			go.foo = function foo() {
				called = true;
			};
			var opts = {fname: 'foo', delay: 2147483648};
			// check that we're
			var handle = go.scheduleTimer(opts, 'key');
			setTimeout(function () {
				assert.isFalse(called, 'prevented the timer from firing ' +
					'immediately for a delay value >= 2^31');
				assert.strictEqual(opts.delay, 2147483647, 'delay value limited');
				clearTimeout(handle);  // clean up
				done();
			}, 5);
		});
	});


	suite('setGsTimer', function () {

		test('works as expected for regular timers', function () {
			var go = new GameObject({foo: function foo() {}});
			go.scheduleTimer = function verify(options, key) {
				assert.deepEqual(options,
					{fname: 'foo', args: ['x'], delay: 123});
				assert.strictEqual(key, 'foo');
				return 'zarg';
			};
			go.setGsTimer({fname: 'foo', args: ['x'], delay: 123});
			assert.lengthOf(Object.keys(go.gsTimers), 1);
			assert.strictEqual(go.gsTimers.foo.options.fname, 'foo');
			assert.strictEqual(go.gsTimers.foo.options.delay, 123);
			assert.deepEqual(go.gsTimers.foo.options.args, ['x']);
			assert.strictEqual(go.gsTimers.foo.handle, 'zarg');
			assert.isNumber(go.gsTimers.foo.start);
		});

		test('works as expected for multi timers', function () {
			var go = new GameObject({foo: function foo() {}});
			go.scheduleTimer = function verify(options, key) {
				assert.deepEqual(options,
					{fname: 'foo', multi: true, delay: 1});
				assert.strictEqual(key.substr(0, 3), 'foo');
				assert.isTrue(key.length > 3);
			};
			go.setGsTimer({fname: 'foo', multi: true, delay: 1});
			assert.lengthOf(Object.keys(go.gsTimers), 1);
			var key = Object.keys(go.gsTimers)[0];
			assert.deepEqual(go.gsTimers[key].options,
				{fname: 'foo', multi: true, delay: 1});
		});

		test('consecutively set multi timers have different keys', function () {
			var go = new GameObject({foo: function foo() {}});
			go.scheduleTimer = function dummy() {};
			go.setGsTimer({fname: 'foo', multi: true, delay: 1});
			go.setGsTimer({fname: 'foo', multi: true, delay: 1});
			assert.lengthOf(Object.keys(go.gsTimers), 2);
			var keys = Object.keys(go.gsTimers);
			assert.notStrictEqual(keys[0], keys[1]);
		});

		test('fails silently if timer already defined for the method', function () {
			var go = new GameObject({foo: function foo() {}});
			go.scheduleTimer = function dummy() {};
			go.setGsTimer({fname: 'foo', delay: 100});
			go.setGsTimer({fname: 'foo', delay: 100});
			assert.lengthOf(Object.keys(go.gsTimers), 1);
		});

		test('works as expected for intervals', function () {
			var go = new GameObject({foo: function foo() {}});
			go.scheduleTimer = function verify(options, key) {
				assert.strictEqual(options.interval, true);
				assert.strictEqual(key, 'foo');
			};
			go.setGsTimer({fname: 'foo', interval: true, delay: 1000});
			assert.lengthOf(Object.keys(go.gsTimers), 1);
			assert.deepEqual(go.gsTimers.foo.options,
				{fname: 'foo', interval: true, delay: 1000});
		});

		test('start property contains start of last call for intervals',
			function (done) {
			var go = new GameObject();
			var calls = 0;
			var prevStart;
			go.foo = function foo() {
				if (calls++ > 0) {
					assert.isTrue(go.gsTimers.foo.start > prevStart);
					go.cancelGsTimer('foo', true);  // clean up
					done();
				}
				prevStart = go.gsTimers.foo.start;
			};
			go.setGsTimer({fname: 'foo', delay: 10, interval: true});
		});

		test('fails with invalid options or option combinations', function () {
			assert.throw(function () {
				new GameObject().setGsTimer({fname: 'meh'});
			}, assert.AssertionError, 'no such function');
			assert.throw(function () {
				new GameObject().setGsTimer({fname: 'setGsTimer', multi: true,
					interval: true});
			}, assert.AssertionError, 'multi intervals not supported');
		});
	});


	suite('gsTimerExists', function () {

		test('works as expected', function (done) {
			var calls = 0;
			var go = new GameObject();
			go.tfoo = go.ifoo = function foo() {
				calls++;
				if (calls <= 1) {
					assert.isFalse(go.gsTimerExists('tfoo'),
						'one-off timer fired');
				}
				else {
					assert.isTrue(go.gsTimerExists('ifoo', true),
						'interval fired, but still enabled');
					go.cancelGsTimer('ifoo', true);  // clean up
					done();
				}
			};
			go.setGsTimer({fname: 'tfoo', delay: 5});
			assert.isTrue(go.gsTimerExists('tfoo'), 'timer scheduled');
			go.setGsTimer({fname: 'ifoo', delay: 10, interval: true});
			assert.isTrue(go.gsTimerExists('ifoo', true), 'interval scheduled');
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
			go.tfoo = go.ifoo = function foo(arg) {
				calls++;
				if (arg === 'fin') {
					assert.strictEqual(calls, 1);
					go.cancelGsTimer('foo', true);  // clean up
					done();
				}
			};
			go.setGsTimer({fname: 'tfoo', delay: 5});
			go.setGsTimer({fname: 'ifoo', delay: 8, interval: true});
			setTimeout(function wait() {
				// give the timer/intervals a chance to fire, if they weren't really suspended
				go.tfoo('fin');
			}, 20);
			go.suspendGsTimers();
			assert.notProperty(go.gsTimers.tfoo, 'handle');
			assert.notProperty(go.gsTimers.ifoo, 'handle');
		});
	});


	suite('resumeGsTimers', function () {

		this.slow(200);

		test('resumes timers', function (done) {
			var now = new Date().getTime();
			var go = new GameObject();
			go.gsTimers = {
				past: {
					options: {fname: 'past', args: ['past'], delay: 50},
					start: now - 100,
				},
				future: {
					options: {fname: 'future', args: ['future'], delay: 20},
					start: now - 10,
				},
			};
			var calls = [];
			go.past = go.future = function handler(arg) {
				calls.push(arg);
				if (calls.length === 2) {
					assert.deepEqual(calls, ['past', 'future']);
					done();
				}
			};
			go.resumeGsTimers();
			assert.deepEqual(calls, [], 'past timer not fired synchronously');
			assert.property(go.gsTimers.past, 'handle', 'past timer rescheduled');
			assert.property(go.gsTimers.future, 'handle', 'future timer resumed');
		});

		test('resumes intervals, catching up if necessary', function (done) {
			var go = new GameObject();
			go.gsTimers = {
				foo: {
					options: {fname: 'foo', delay: 30, interval: true},
					start: new Date().getTime() - 80,
				},
			};
			var count = 0;
			go.foo = function foo() {
				count++;
				if (count === 4) {
					assert.deepEqual(Object.keys(go.gsTimers), ['foo'],
						'partial interval call and resume timer done');
					assert.property(go.gsTimers.foo, 'handle',
						'interval running');
					go.cancelGsTimer('foo', true);  // clean up
					done();
				}
			};
			go.resumeGsTimers();
			assert.strictEqual(count, 2, 'catch-up calls fired synchronously');
			assert.lengthOf(Object.keys(go.gsTimers), 3, 'one "partial ' +
				'interval" timer, one "interval restart" timer and the interval itself');
			for (var k in go.gsTimers) {
				assert.isTrue(k.indexOf('foo_') === 0 ||
					k.indexOf('setGsTimer_') === 0 || k === 'foo');
				if (k.indexOf('setGsTimer_') === 0) {
					assert.isTrue(go.gsTimers[k].options.delay <= 10,
						'partial interval time calculated correctly');
					assert.isTrue(go.gsTimers[k].options.internal,
						'resume timer is an internal timer');
					assert.deepEqual(go.gsTimers[k].options.args,
						[{fname: 'foo', delay: 30, interval: true}]);
				}
			}
			assert.notProperty(go.gsTimers.foo, 'handle',
				'interval itself not resumed yet');
		});

		test('does not resume interval if the object is deleted while catching up',
			function () {
			var go = new GameObject();
			go.gsTimers = {
				foo: {
					options: {fname: 'foo', delay: 20, interval: true},
					start: new Date().getTime() - 90,
				},
			};
			var count = 0;
			go.foo = function foo() {
				count++;
				if (count >= 3) {
					go.del();
				}
			};
			go.resumeGsTimers();
			assert.strictEqual(count, 3,
				'catch-up calls only fired until object was deleted');
			assert.notProperty(go.gsTimers, 'setGsTimer',
				'no partial interval call/resume timer scheduled');
			assert.notProperty(go.gsTimers.foo, 'handle',
				'interval itself not resumed');  // it is still configured but we don't care, the object is deleted anyway
		});

		test('does not catch up interval if noCatchUp is true', function (done) {
			var go = new GameObject();
			go.gsTimers = {
				foo: {
					options: {fname: 'foo', delay: 30, interval: true, noCatchUp: true},
					start: new Date().getTime() - 80,
				},
			};
			var count = 0;
			var resumeFinished = false;
			go.foo = function foo() {
				count++;
				assert.isTrue(resumeFinished);
				assert.strictEqual(count, 1, 'first regular interval call, ' +
					'no catch-up calls');
				done();
			};
			go.resumeGsTimers();
			resumeFinished = true;
		});
	});


	suite('cancelGsTimer', function () {

		test('works as expected', function (done) {
			var go = new GameObject();
			var calls = 0;
			go.tfoo = go.ifoo = function foo(arg) {
				calls++;
				// expecting the multi-timer call (not canceled) and the explicit "manual" call
				if (arg === 'fin') {
					assert.strictEqual(calls, 2);
					done();
				}
			};
			go.setGsTimer({fname: 'tfoo', delay: 5});
			go.setGsTimer({fname: 'ifoo', delay: 10, interval: true});
			go.setGsTimer({fname: 'tfoo', delay: 15, multi: true});
			go.cancelGsTimer('tfoo');
			go.cancelGsTimer('ifoo', true);
			assert.notProperty(go.gsTimers, 'ifoo');
			assert.notProperty(go.gsTimers, 'tfoo');
			setTimeout(function wait() {
				go.tfoo('fin');
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
