'use strict';

var RQ = require('data/RequestQueue');


suite('RequestQueue', function () {

	suite('push', function () {

		test('adds requests to queue and triggers execution', function (done) {
			var rq = new RQ();
			var firstReqProcessed = false;
			var firstCallbackCalled = false;
			rq.push('tag1',
				function firstReq() {
					firstReqProcessed = true;
				},
				undefined,
				function firstCb() {
					firstCallbackCalled = true;
				}
			);
			rq.push('tag2',
				function secondReq() {},
				undefined,
				function callback(err) {
					assert.isTrue(firstReqProcessed);
					assert.isTrue(firstCallbackCalled);
					return done(err);
				}
			);
		});
	});


	suite('next', function () {

		test('dequeues requests one by one', function () {
			var rq = new RQ();
			var checkBusy = function checkBusy(req) {
				assert.isTrue(rq.busy);
			};
			rq.queue = [
				{func: checkBusy},
				{func: checkBusy},
			];
			rq.next();
			assert.lengthOf(rq.queue, 1);
			rq.next();
			assert.lengthOf(rq.queue, 0);
			assert.isFalse(rq.busy);
		});

		test('does nothing when called with empty queue', function () {
			var rq = new RQ();
			rq.handle = function check() {
				throw new Error('should not happen');
			};
			rq.next();
		});

		test('does nothing when already busy processing a message', function () {
			var rq = new RQ();
			rq.queue = [{
				func: function checkNotCalled(req) {
					throw new Error('should not happen');
				},
			}];
			rq.busy = true;
			rq.next();
		});
	});


	suite('handle', function () {

		test('executes a request', function (done) {
			var rq = new RQ();
			var called = false;
			rq.handle({
				func: function check() {
					called = true;
				},
				callback: function cb(err) {
					if (err) return done(err);
					assert.isTrue(called);
					assert.isFalse(rq.busy);
					return done();
				},
			});
		});

		test('resets busy flag in case of thrown errors', function (done) {
			var rq = new RQ();
			rq.handle({
				func: function simulateError() {
					throw new Error('something went wrong');
				},
				callback: function cb(err) {
					assert.strictEqual(err.message, 'something went wrong');
					assert.isFalse(rq.busy);
					return done();
				},
			});
		});

		test('triggers execution of next request', function (done) {
			var rq = new RQ();
			rq.queue = [{
				func: function checkNextReqCalled() {
					done();
				},
			}];
			rq.handle({func: function dummy() {}});
		});

		test('passes the request function result to the callback', function (done) {
			var rq = new RQ();
			rq.handle({
				func: function func() {
					return 28;
				},
				callback: function cb(err, res) {
					assert.strictEqual(res, 28);
					return done(err);
				},
			});
		});
	});
});
