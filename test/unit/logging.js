'use strict';

var rewire = require('rewire');
var logging = rewire('logging');


suite('logging', function () {


	suite('logAction', function () {

		var origActionLogger;


		setup(function () {
			origActionLogger = logging.__get__('actionLogger');
		});

		teardown(function () {
			logging.__set__('actionLogger', origActionLogger);
		});


		test('works as expected', function (done) {
			logging.__set__('actionLogger', {
				info: function info(fields, msg) {
					assert.strictEqual(msg, 'XYZ');
					assert.deepEqual(fields,
						{action: 'XYZ', abc: '12', def: 'foo'});
					done();
				},
			});
			logging.logAction('XYZ', ['abc=12', 'def=foo']);
		});

		test('handles improperly formatted fields gracefully', function (done) {
			logging.__set__('actionLogger', {
				info: function info(fields, msg) {
					assert.strictEqual(msg, 'meh');
					assert.deepEqual(fields,
						{action: 'meh', 'UNKNOWN#0': 'barf', 'UNKNOWN#1': '123',
						'UNKNOWN#2': 'null', 'UNKNOWN#3': 'undefined'});
					done();
				},
			});
			logging.logAction('meh', ['barf', 123, null, undefined]);
		});

		test('fails on invalid action parameter', function () {
			assert.throw(function () {
				logging.logAction();
			}, assert.AssertionError);
		});
	});
});
