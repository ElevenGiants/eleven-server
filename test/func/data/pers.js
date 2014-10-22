'use strict';

var path = require('path');
var pers = require('data/pers');
var gsjsBridge = require('model/gsjsBridge');
var GameObject = require('model/GameObject');
var Player = require('model/Player');
var Item = require('model/Item');
var pbeMock = require('../../mock/pbe');
var RC = require('data/RequestContext');


suite('pers', function () {

	var FIXTURES_PATH = path.resolve(path.join(__dirname, '../fixtures'));

	this.timeout(5000);
	this.slow(1000);

	suiteSetup(function () {
		// initialize gsjsBridge data structures (empty) without loading all the prototypes
		gsjsBridge.reset();
	});

	suiteTeardown(function () {
		// reset gsjsBridge so the cached prototypes don't influence other tests
		gsjsBridge.reset();
	});

	setup(function (done) {
		pers.init(pbeMock, FIXTURES_PATH, done);
	});

	teardown(function () {
		pers.init();  // disable mock back-end
	});

	suite('game object loading', function () {

		test('loaded game objects are initialized correctly', function (done) {
			new RC().run(function () {
				var o = pers.get('IHFK8C8NB6J2FJ5');
				assert.instanceOf(o, Item);
				assert.instanceOf(o, GameObject);
				assert.strictEqual(o.constructor.name, o.class_tsid);
				assert.property(o, 'distributeQuoinShards', 'quoin-specific property');
				assert.property(o, 'distanceFromPlayer', 'property from item.js');
			}, done);
		});

		test('recursive structures (Player with inventory) are loaded correctly',
			function (done) {
			new RC().run(function () {
				var p = pers.get('P00000000000002');
				assert.instanceOf(p, Player);
				assert.deepEqual(Object.keys(p.items), ['I00000000000002']);
				assert.isTrue(p.items.I00000000000002.__isORP);
			}, done);
		});
	});
});
