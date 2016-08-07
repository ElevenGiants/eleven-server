'use strict';

var _ = require('lodash');
var RQ = require('data/RequestQueue');


suite('RequestQueue', function () {

	setup(function () {
		RQ.init();
	});

	teardown(function () {
		RQ.init();
	});


	suite('create', function () {

		test('creates and registers RQs for locations and groups only', function () {
			RQ.create('LXYZ');
			RQ.create('RXYZ');
			RQ.create('IXYZ');
			RQ.create('PXYZ');
			RQ.create('_special');
			assert.instanceOf(RQ.get('LXYZ'), RQ);
			assert.instanceOf(RQ.get('RXYZ'), RQ);
			assert.instanceOf(RQ.get('_special'), RQ);
			assert.isUndefined(RQ.get('IXYZ'));
			assert.isUndefined(RQ.get('PXYZ'));
		});
	});


	suite('push', function () {

		test('adds requests to queue and triggers execution', function (done) {
			var rq = new RQ();
			var firstReqProcessed = false;
			var firstCallbackCalled = false;
			rq.push('tag1',
				function firstReq() {
					firstReqProcessed = true;
				},
				function firstCb() {
					firstCallbackCalled = true;
				}
			);
			rq.push('tag2',
				_.noop,
				function callback(err) {
					assert.isTrue(firstReqProcessed);
					assert.isTrue(firstCallbackCalled);
					return done(err);
				}
			);
		});

		test('handles close requests', function (done) {
			var rq = RQ.create('LX');
			var closeReqProcessed = false;
			rq.push('close',
				_.noop,
				function (err) {
					if (err) return done(err);
					assert.isTrue(rq.closing, 'closing flag set');
					closeReqProcessed = true;
				}, {close: true}
			);
			rq.push('after',
				function () {
					throw new Error('should not be reached');
				},
				function (err) {
					assert.isUndefined(err, 'push is ignored silently');
					assert.lengthOf(rq.queue, 1, 'request not queued');
					setTimeout(function () {
						// wait for 'close' request to be processed (scheduled via setImmediate)
						assert.isTrue(closeReqProcessed, 'close request callback called');
						assert.isUndefined(RQ.get('LX', true), 'RQ actually closed');
						done();
					}, 10);
				}
			);
		});
	});


	suite('next', function () {

		test('dequeues requests one by one', function () {
			var rq = new RQ();
			var checkBusy = function checkBusy(req) {
				assert.isNotNull(rq.inProgress);
			};
			rq.queue = [
				{func: checkBusy},
				{func: checkBusy},
			];
			rq.next();
			assert.lengthOf(rq.queue, 1);
			rq.next();
			assert.lengthOf(rq.queue, 0);
			assert.isNull(rq.inProgress);
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
			rq.inProgress = {foo: 'fake'};
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
					assert.isNull(rq.inProgress);
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
					assert.isNull(rq.inProgress);
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
			rq.handle({func: _.noop});
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
