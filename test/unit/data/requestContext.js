'use strict';

var rewire = require('rewire');
var rc = rewire('data/requestContext');
var persMock = require('../../mock/pers');


suite('requestContext', function() {

	setup(function() {
		rc.__set__('pers', persMock);
		persMock.reset();
	});
	
	teardown(function() {
		rc.__set__('pers', rewire('data/pers'));
	});
	
	
	suite('getContext', function() {
		
		test('fails when called outside a request context', function() {
			assert.throw(function() {
				rc.getContext();
			}, assert.AssertionError);
		});
		
		test('does its job', function(done) {
			rc.run(function() {
				var ctx = rc.getContext();
				assert.isDefined(ctx);
				assert.strictEqual(ctx.logtag, 'testlogtag');
				done();
			}, 'testlogtag');
		});
	});
	
	
	suite('run', function() {
	
		test('initializes request data structures', function(done) {
			rc.run(function() {
				var ctx = rc.getContext();
				assert.property(ctx, 'cache');
				assert.deepEqual(ctx.cache, {});
				assert.property(ctx, 'dirty');
				assert.deepEqual(ctx.dirty, {});
				done();
			});
		});
		
		test('persists dirty objects after request is finished', function(done) {
			rc.run(function() {
				rc.setDirty({tsid: 'IA'});
				rc.setDirty({tsid: 'IB', deleted: true});
				assert.deepEqual(Object.keys(rc.getContext().dirty), ['IA', 'IB']);
				assert.deepEqual(persMock.getDirtyList(), {});  // request in progress, list not processed yet
			}, '', '',
			function callback() {
				assert.deepEqual(persMock.getDirtyList(), {
					IA: {tsid: 'IA'},
					IB: {tsid: 'IB', deleted: true},
				});
				done();
			});
		});
		
		test('runs request function and returns its return value in callback', function(done) {
			var derp = 1;
			rc.run(function() {
				derp = 3;
				return 'hooray';
			}, '', '',
			function callback(err, res) {
				assert.strictEqual(derp, 3);
				assert.strictEqual(res, 'hooray');
				done();
			});
		});
		
		test('passes errors thrown by the request function back in callback', function(done) {
			rc.run(function() {
				throw new Error('meh');
			}, '', '',
			function callback(err, res) {
				assert.isDefined(err);
				assert.strictEqual(err.message, 'meh');
				done();
			});
		});
	});
});
