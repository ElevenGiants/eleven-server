'use strict';

var rewire = require('rewire');
var logging = rewire('logging');
var RC = require('data/RequestContext');


suite('logging', function () {

	var origLogger;

	setup(function () {
		origLogger = logging.__get__('logger');
		logging.__set__('logger', log);
	});

	teardown(function () {
		logging.__set__('logger', origLogger);
	});


	suite('custom log emitter', function () {

		test('does not modify passed data object', function (done) {
			var data = {some: 'data'};
			var emitter = function () {
				if (!arguments.length) return true;  // just to fool log level test
				assert.deepEqual(data, {some: 'data'});
				done();
			};
			var wrapLogEmitter = logging.__get__('wrapLogEmitter');
			var wrappedEmitter = wrapLogEmitter(emitter);
			new RC().run(function () {
				wrappedEmitter(data, 'foozux');
			}, function cb(err) {
				if (err) return done(err);
			});
		});
	});
});
