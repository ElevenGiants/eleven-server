'use strict';

var path = require('path');
var rewire = require('rewire');
var pers = rewire('data/pers');
var persProxy = rewire('data/persProxy');
var rc = require('data/RequestContext');
var persMock = require('../../mock/pers');
var pbeMock = require('../../mock/pbe');
var rpcMock = require('../../mock/rpc');
var rcMock = require('../../mock/RequestContext');
var Location = rewire('model/Location');
var Geo = require('model/Geo');
var gsjsBridge = rewire('model/gsjsBridge');

// introduce rewired components to each other
pers.__set__('gsjsBridge', gsjsBridge);
pers.__set__('persProxy', persProxy);
gsjsBridge.__set__('Location', Location);
Location.__set__('pers', pers);


suite('Location', function () {
	
	suite('Location/Geo integration', function () {
	
		setup(function () {
			persProxy.__set__('RC', rcMock);
			rcMock.reset();
			persMock.reset();
		});
		
		teardown(function () {
			persProxy.__set__('RC', rc);
			rcMock.reset();
			persMock.reset();
		});


		test('Location initialization does not flag Location or Geo as dirty', function () {
			var g = persProxy.makeProxy(new Geo({tsid: 'GX'}));
			persProxy.makeProxy(new Location({tsid: 'LX'}, g));
			assert.strictEqual(rcMock.getDirtyList().length, 0);
		});
		
		test('geometry changes do not set dirty flag for Location', function () {
			var g = persProxy.makeProxy(new Geo({tsid: 'GX', layers: {middleground: {doors: {}}}}));
			var l = persProxy.makeProxy(new Location({tsid: 'LX'}, g));
			l.geometry.layers.middleground.doors.d = {
				connect: {target: {label: 'china', tsid: 'LABC'}},
			};
			l.updateGeo();
			assert.deepEqual(rcMock.getDirtyList(), ['GX']);
		});
		
		test('replacing the whole geometry with a plain object is handled right', function () {
			// GSJS does that (loc.geometry = {})
			Location.__set__('pers', persMock);
			var g = new Geo({tsid: 'GX'});
			var l = new Location({tsid: 'LX'}, g);
			persMock.preAdd(g);
			persMock.preAdd(l);
			l.geometry = {something: 'foomp', tsid: 'GFOO'};
			l.updateGeo();
			// check that object was converted to Geo
			assert.instanceOf(l.geometry, Geo);
			assert.strictEqual(l.geometry.something, 'foomp');
			assert.strictEqual(l.geometry.tsid, 'GX', 'TSID changed back according to Location TSID');
			// check that it will be persisted
			assert.deepEqual(Object.keys(persMock.getDirtyList()), ['GX']);
			var newG = persMock.getDirtyList().GX;
			assert.instanceOf(newG, Geo);
			assert.strictEqual(newG.tsid, 'GX');
			assert.strictEqual(newG.something, 'foomp');
			// cleanup
			Location.__set__('pers', pers);
		});
	});
	
	
	suite('loading', function () {
	
		this.timeout(10000);
		this.slow(4000);
		
		suiteSetup(function () {
			// initialize gsjsBridge data structures (empty) without loading all the prototypes
			gsjsBridge.reset();
		});
		
		suiteTeardown(function () {
			// reset gsjsBridge so the cached prototypes don't influence other tests
			gsjsBridge.reset();
		});
		
		setup(function (done) {
			persProxy.__set__('RC', rcMock);
			pers.__set__('RC', rcMock);
			pers.__set__('rpc', rpcMock);
			rcMock.reset();
			pers.init(pbeMock, path.resolve(path.join(__dirname, '../fixtures')), done);
		});
		
		teardown(function () {
			persProxy.__set__('RC', rc);
			pers.__set__('RC', rc);
			pers.__set__('rpc', require('data/rpc'));
			persMock.reset();
			pers.init();  // disable mock back-end
			rcMock.reset();
		});


		test('loading from persistence loads respective Geo object automatically', function () {
			var l = pers.get('LLI32G3NUTD100I');
			assert.instanceOf(l.geometry, Geo);
			assert.strictEqual(l.geometry.tsid, 'GLI32G3NUTD100I');
			assert.strictEqual(l.geo.l, -3000);
			var door = l.clientGeometry.layers.middleground.doors.door_1300233269757;
			assert.strictEqual(door.connect.street_tsid, 'LCR177QO65T1EON');
			assert.isTrue(door.connect.target.__isORP);
			assert.strictEqual(pbeMock.getCounts().read, 2);
			assert.strictEqual(pbeMock.getCounts().write, 0);
			assert.strictEqual(pbeMock.getCounts().del, 0);
		});
	});
});
