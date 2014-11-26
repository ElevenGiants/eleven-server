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

		test('loads local objects and proxifies them', function () {
			var o = {tsid: 'ITEST', some: 'data'};
			pbeMock.write(o);
			var lo = load(o.tsid);
			assert.strictEqual(lo.tsid, 'ITEST');
			var cache = pers.__get__('cache');
			assert.property(cache, o.tsid);
			assert.strictEqual(cache[o.tsid].some, 'data');
			assert.isTrue(cache[o.tsid].__isPP);
		});

		test('calls onLoad and resumeGsTimers', function () {
			var onLoadCalled = false;
			var resumeGsTimersCalled = false;
			var o = {
				tsid: 'ITEM',
				onLoad: function onLoad() {
					onLoadCalled = true;
				},
				resumeGsTimers: function resumeGsTimers() {
					resumeGsTimersCalled = true;
				},
			};
			pbeMock.write(o);
			load(o.tsid);
			assert.isTrue(onLoadCalled);
			assert.isTrue(resumeGsTimersCalled);
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
			assert.isUndefined(lo.__isPP, 'is not wrapped in persistence proxy');
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
				onLoad: function onLoad() {
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

		test('adds created objects to the live object cache, proxifies them ' +
			'and flags them as dirty', function () {
			var p = pers.create(Item, {
				tsid: 'I123',
				something: 'dumb',
			});
			var cache = pers.__get__('cache');
			assert.property(cache, 'I123');
			assert.strictEqual(cache.I123.something, 'dumb');
			assert.isTrue(p.__isPP);
			assert.isTrue(cache.I123.__isPP);
			assert.deepEqual(rcMock.getDirtyList(), ['I123']);
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

		test('does the job', function () {
			var dlist = {
				I1: new GameObject({tsid: 'I1'}),
				I2: new GameObject({tsid: 'I2'}),
				P1: new GameObject({tsid: 'P1'}),
			};
			dlist.I2.deleted = true;
			dlist.P1.deleted = false;
			pers.postRequestProc(dlist, {});
			assert.strictEqual(pbeMock.getCounts().write, 2);
			assert.strictEqual(pbeMock.getCounts().del, 1);
		});

		test('unloads objects from cache', function () {
			var o1 = new GameObject({tsid: 'I1'});
			var o2 = new GameObject({tsid: 'I2'});
			pers.__set__('cache', {I1: o1, I2: o2});
			var ulist = {I2: o2};
			pers.postRequestProc({}, ulist);
			assert.strictEqual(pbeMock.getCounts().write, 0);
			assert.strictEqual(pbeMock.getCounts().del, 0);
			assert.deepEqual(pers.__get__('cache'), {I1: o1});
		});

		test('calls callback after persistence operations', function (done) {
			var o1 = new GameObject({tsid: 'I1'});
			pers.__set__('cache', {I1: o1});
			var dlist = {I1: o1};
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
				pers.postRequestProc(dlist, {}, '', function cb() {
					callbackCalled = true;
					assert.isTrue(writeCalled);
					done();
				});
			});
		});
	});
});
