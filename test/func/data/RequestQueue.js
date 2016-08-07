'use strict';

var _ = require('lodash');
var rewire = require('rewire');
var RC = rewire('data/RequestContext');
var RQ = rewire('data/RequestQueue');


suite('RequestQueue', function () {

	setup(function () {
		RQ.__set__('RC', RC);
		RQ.init();
	});

	teardown(function () {
		RQ.__set__('RC', require('data/RequestContext'));
		RQ.init();
	});


	suite('request flow control', function () {

		this.slow(200);

		test('does not block followup requests when waitPers flag is set', function (done) {
			var calls = [];
			RC.__set__('pers', {
				postRequestProc: function mockPostRequestProc(dl, ul, logmsg, cb) {
					calls.push('PRP' + RC.getContext().tag[0]);
					setTimeout(cb, 50 * _.size(dl));
				},
			});
			var rq = new RQ();
			rq.push('1',
				// request with fake slow post-request persistence operations
				function req1() {
					calls.push('REQ1');
					RC.setDirty({tsid: 'IDUMMY'});
				},
				function cb1(err) {
					calls.push('CB1');
					assert.deepEqual(calls, ['REQ1', 'PRP1', 'REQ2', 'PRP2', 'CB2', 'CB1']);
					RC.__set__('pers', require('data/pers'));
					return done();
				},
				{waitPers: true}
			);
			rq.push('2',
				// followup request that should run immediately after req1
				// (before its changes have been persisted)
				function req2() {
					calls.push('REQ2');
				},
				function cb2(err) {
					calls.push('CB2');
				}
			);
		});
	});
});
