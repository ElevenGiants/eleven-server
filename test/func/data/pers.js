'use strict';

var path = require('path');
var rewire = require('rewire');
var pers = rewire('data/pers');
var gsjsBridge = require('model/gsjsBridge');
var GameObject = require('model/GameObject');
var Item = require('model/Item');
var pbeMock = require('../../mock/pbe');
var rpcMock = require('../../mock/rpc');
var rcMock = require('../../mock/RequestContext');


suite('pers', function() {

	var FIXTURES_PATH = path.resolve(path.join(__dirname, '../fixtures'));
	
	this.timeout(5000);
	this.slow(1000);
	
	suiteSetup(function() {
		// initialize gsjsBridge data structures (empty) without loading all the prototypes
		gsjsBridge.reset();
	});
	
	suiteTeardown(function() {
		// reset gsjsBridge so the cached prototypes don't influence other tests
		gsjsBridge.reset();
	});
	
	setup(function(done) {
		pers.__set__('rpc', rpcMock);
		pers.__set__('RC', rcMock);
		rcMock.reset();
		pers.init(pbeMock, FIXTURES_PATH, done);
	});
	
	teardown(function() {
		pers.__set__('rpc', require('data/rpc'));
		pers.__set__('RC', require('data/RequestContext'));
		rcMock.reset();
		pers.init();  // disable mock back-end
	});
	

	suite('game object loading', function() {
		
		test('loaded game objects are initialized correctly', function() {
			var o = pers.get('IHFK8C8NB6J2FJ5');
			assert.instanceOf(o, Item);
			assert.instanceOf(o, GameObject);
			assert.strictEqual(o.constructor.name, o.class_tsid);
			assert.property(o, 'distributeQuoinShards', 'quoin-specific property');
			assert.property(o, 'distanceFromPlayer', 'property from item.js');
		});
	});
});
