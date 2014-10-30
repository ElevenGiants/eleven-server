'use strict';

var gsjsBridge = require('model/gsjsBridge');
var RC = require('data/RequestContext');
var Player = require('model/Player');
var Location = require('model/Location');
var Geo = require('model/Geo');
var Item = require('model/Item');
var Bag = require('model/Bag');
var pers = require('data/pers');
var utils = require('utils');
var pbeMock = require('../../mock/pbe');


suite('Player', function () {

	setup(function () {
		gsjsBridge.init(true);
		pers.init(pbeMock);
	});

	teardown(function () {
		gsjsBridge.reset();
		pers.init();  // disable mock back-end
	});


	suite('create', function () {

		//TODO: test fails because of missing API functions and should be activated once they are available
		test.skip('does its job', function (done) {
			new RC().run(
				function () {
					var g = Geo.create();
					var l = Location.create(g);
					var p = Player.create({
						label: 'Edgar',
						userid: '123',
						location: l,
					});
					assert.isTrue(p.__isPP);
					assert.isTrue(utils.isPlayer(p));
					assert.strictEqual(p.class_tsid, 'human');
					assert.strictEqual(p.label, 'Edgar');
				},
				function cb(err, res) {
					if (err) return done(err);
					var db = pbeMock.getDB();
					assert.strictEqual(pbeMock.getCounts().write, 1);
					assert.strictEqual(Object.keys(db).length, 1);
					done();
				}
			);
		});

		test('fails with missing properties', function () {
			assert.throw(function () {
				Player.create({userid: '123', label: 'Ezekiel'});
			}, assert.AssertionError);  // location is missing
		});

		test('fails with invalid properties', function () {
			assert.throw(function () {
				Player.create({userid: 123});
			}, assert.AssertionError); // userid expected to be a string
		});
	});


	suite('addToAnySlot', function () {

		test('adds to player inventory, splits items if necessary',
			function (done) {
			new RC().run(function () {
				//var b = Bag.create('bag_bigger_gray');
				var p = new Player();
				var i1 = Item.create('apple', 3);
				p.addToAnySlot(i1, 0, 16, null, 2);
				assert.strictEqual(i1.count, 1);
				assert.lengthOf(Object.keys(p.items), 1);
				var i2 = p.getSlot(0);
				assert.strictEqual(i2.class_tsid, 'apple');
				assert.strictEqual(i2.count, 2);
			}, done);
		});

		test('adds to bag in inventory, deletes source item if necessary',
			function (done) {
			new RC().run(function () {
				var b = Bag.create('bag_bigger_gray');
				var p = new Player();
				b.setContainer(p);
				var i1 = Item.create('apple', 3);
				b.addToSlot(i1, 0);
				var i2 = Item.create('apple', 3);
				p.addToAnySlot(i2, 0, 16, b.path);
				assert.strictEqual(b.getSlot(0), i1);
				assert.strictEqual(i1.count, 6);
				assert.strictEqual(i2.count, 0);
				assert.isTrue(i2.deleted);
			}, done);
		});

		test('distributes across multiple slots', function (done) {
			new RC().run(function () {
				var p = new Player();
				var i1 = Item.create('apple', 3);
				i1.stackmax = 5;
				p.addToSlot(i1, 0);
				var i2 = Item.create('apple', 6);
				p.addToAnySlot(i2, 0, 16);
				assert.strictEqual(p.getSlot(0), i1);
				assert.strictEqual(p.getSlot(1), i2);
				assert.strictEqual(i1.count, 5);
				assert.strictEqual(i2.count, 4);
			}, done);
		});
	});
});
