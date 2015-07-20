'use strict';

var rewire = require('rewire');
var pers = rewire('data/pers');
var GameObject = require('model/GameObject');
var Item = require('model/Item');
var gsjsBridgeMock = require('../../mock/gsjsBridge');
var pbeMock = require('../../mock/pbe');
var rpcMock = require('../../mock/rpc');
var rcMock = require('../../mock/RequestContext');


suite('pers', function () {

	suiteSetup(function () {
		var orProxy = rewire('data/objrefProxy');
		pers.__set__('orProxy', orProxy);
		orProxy.__set__('pers', pers);
	});

	suiteTeardown(function () {
		pers.__get__('orProxy').__set__('pers', require('data/pers'));
		pers.__set__('orProxy', require('data/objrefProxy'));
	});

	setup(function (done) {
		pers.__set__('gsjsBridge', gsjsBridgeMock);
		pers.__set__('rpc', rpcMock);
		pers.__set__('RC', rcMock);
		rcMock.reset();
		rpcMock.reset(true);
		pers.init(pbeMock, undefined, done);
	});

	teardown(function () {
		pers.__set__('gsjsBridge', require('model/gsjsBridge'));
		pers.__set__('rpc', require('data/rpc'));
		pers.__set__('RC', require('data/RequestContext'));
		pers.init();  // disable mock back-end
		rcMock.reset();
		rpcMock.reset(true);
	});


	suite('load', function () {

		var load = pers.__get__('load');

		test('loads local objects', function () {
			var o = {tsid: 'ITEST', some: 'data'};
			pbeMock.write(o);
			var lo = load(o.tsid);
			assert.strictEqual(lo.tsid, 'ITEST');
			var cache = pers.__get__('cache');
			assert.property(cache, o.tsid);
			assert.strictEqual(cache[o.tsid].some, 'data');
		});

		test('calls gsOnLoad', function () {
			var onLoadCalled = false;
			var o = {
				tsid: 'ITEM',
				gsOnLoad: function gsOnLoad() {
					onLoadCalled = true;
				},
			};
			pbeMock.write(o);
			load(o.tsid);
			assert.isTrue(onLoadCalled);
		});

		test('does not choke on objref cycles', function () {
			var a = {
				tsid: 'IA',
				ref: {objref: true, tsid: 'IB'},
			};
			var b = {
				tsid: 'IB',
				ref: {objref: true, tsid: 'IA'},
			};
			pbeMock.write(a);
			pbeMock.write(b);
			var la = load(a.tsid);
			var cache = pers.__get__('cache');
			assert.property(cache, a.tsid);
			assert.isTrue(la.ref.__isORP);
			assert.strictEqual(la.ref.tsid, 'IB');
		});

		test('does not choke on unavailable objrefs', function () {
			var o = {tsid: 'IO', ref: {objref: true, tsid: 'IUNAVAILABLE'}};
			pbeMock.write(o);
			var lo = load(o.tsid);
			assert.isTrue(lo.ref.__isORP);
		});

		test('handles remote objects properly', function () {
			rpcMock.reset(false);
			var o = {tsid: 'ITEST', some: 'data'};
			pbeMock.write(o);
			var lo = load(o.tsid);
			assert.isTrue(lo.__isRP, 'is wrapped in RPC proxy');
			assert.isDefined(rcMock.getContext().cache.ITEST, 'in request cache');
			assert.notProperty(pers.__get__('cache'), 'ITEST',
				'not in live object cache');
		});
	});


	suite('get', function () {

		test('getting an already loaded object reads it from cache', function () {
			var onLoadCalls = 0;
			pbeMock.write({
				tsid: 'I1',
				gsOnLoad: function gsOnLoad() {
					onLoadCalls++;
				},
			});
			pers.get('I1');
			assert.strictEqual(pbeMock.getCounts().read, 1);
			assert.strictEqual(onLoadCalls, 1);
			pers.get('I1');
			assert.strictEqual(pbeMock.getCounts().read, 1);
			assert.strictEqual(onLoadCalls, 1);
		});

		test('if an object is already in the request cache, get it from there',
			function () {
			rcMock.getContext().cache.IA = {tsid: 'IA'};
			assert.strictEqual(pers.get('IA').tsid, 'IA');
			assert.strictEqual(pbeMock.getCounts().read, 0);
		});

		test('fails early when given an invalid TSID', function () {
			assert.throw(function () {
				pers.get('');
			}, assert.AssertionError);
		});
	});


	suite('create', function () {

		test('adds created objects to the live object cache', function () {
			var i = pers.create(Item, {
				tsid: 'I123',
				something: 'dumb',
			});
			var cache = pers.__get__('cache');
			assert.property(cache, 'I123');
			assert.strictEqual(cache.I123.something, 'dumb');
			assert.strictEqual(i, cache.I123);
		});

		test('fails with TSID of an already existing object', function () {
			pers.__get__('cache').ITEST = 'foo';
			assert.throw(function () {
				pers.create(Item, {tsid: 'ITEST'});
			}, assert.AssertionError);
		});

		test('calls onCreate handler', function (done) {
			pers.create(Item, {
				tsid: 'I456',
				onCreate: function onCreate() {
					done();
				},
			});
		});
	});


	suite('postRequestProc/write/del/unload', function () {

		test('does the job', function (done) {
			var o1 = new GameObject({tsid: 'I1'});
			var o2 = new GameObject({tsid: 'I2'});
			var o3 = new GameObject({tsid: 'P1'});
			pers.__set__('cache', {I1: o1, I2: o2, P1: o3});
			var ulist = {I1: o1, I2: o2, P1: o3};
			ulist.I2.deleted = true;
			ulist.P1.deleted = false;
			pers.postRequestProc({}, ulist, null, function cb(err) {
				if (err) return done(err);
				assert.strictEqual(pbeMock.getCounts().write, 2);
				assert.strictEqual(pbeMock.getCounts().del, 1);
				assert.deepEqual(pers.__get__('cache'), {});
				return done();
			});
		});

		test('calls callback after persistence operations', function (done) {
			var o1 = new GameObject({tsid: 'I1'});
			var ulist = {I1: o1};
			var callbackCalled = false;
			var writeCalled = false;
			var pbe = {
				write: function write(obj, callback) {
					writeCalled	= true;
					assert.isFalse(callbackCalled,
						'callback is called *after* persistence operations');
					callback();
				}
			};
			pers.init(pbe, undefined, function () {  // set custom back-end mock
				pers.__set__('cache', {I1: o1});
				pers.postRequestProc({}, ulist, '', function cb() {
					callbackCalled = true;
					assert.isTrue(writeCalled);
					done();
				});
			});
		});

		test('performs operation on all objects, even in case of errors',
			function (done) {
			var errorThrown = false;
			var o1 = new GameObject({tsid: 'I1'});
			var o2 = new GameObject({tsid: 'I2'});
			o1.serialize = function dummy() {
				errorThrown = true;
				throw new Error('should not prevent persisting o2');
			};
			pers.__set__('cache', {I1: o1, I2: o2});
			pers.postRequestProc({}, {I1: o1, I2: o2}, null, function cb(err) {
				assert.strictEqual(err.message, 'should not prevent persisting o2');
				assert.isTrue(errorThrown);
				assert.strictEqual(pbeMock.getCounts().write, 1, 'o2 written');
				return done();
			});
		});

		test('does not perform deletions if updates failed', function () {
			var o1 = new GameObject({tsid: 'I1'});
			var o2 = new GameObject({tsid: 'I2'});
			o2.deleted = true;
			o1.serialize = function dummy() {
				throw new Error('should prevent deletion of o2');
			};
			pers.__set__('cache', {I1: o1, I2: o2});
			pers.postRequestProc({}, {I1: o1, I2: o2});
			assert.strictEqual(pbeMock.getCounts().del, 0,
				'updating o1 failed, further operations (deletes) cancelled');
		});
	});
});
