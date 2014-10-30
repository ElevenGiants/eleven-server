'use strict';

var gsjsBridge = require('model/gsjsBridge');
var RC = require('data/RequestContext');
var Bag = require('model/Bag');
var Item = require('model/Item');
var pers = require('data/pers');
var utils = require('utils');
var pbeMock = require('../../mock/pbe');


suite('Bag', function () {

	setup(function () {
		gsjsBridge.reset();
		pers.init(pbeMock);
	});

	teardown(function () {
		gsjsBridge.reset();
		pers.init();  // disable mock back-end
	});


	suite('create', function () {

		test('does its job', function (done) {
			new RC().run(
				function () {
					var b = Bag.create('bag_bigger_gray');
					assert.isTrue(b.__isPP);
					assert.isTrue(utils.isBag(b));
					assert.strictEqual(b.class_tsid, 'bag_bigger_gray');
					assert.strictEqual(b.constructor.name, 'bag_bigger_gray');
				},
				function cb(err, res) {
					if (err) return done(err);
					var db = pbeMock.getDB();
					assert.strictEqual(pbeMock.getCounts().write, 1);
					assert.strictEqual(Object.keys(db).length, 1);
					assert.strictEqual(db[Object.keys(db)[0]].class_tsid,
						'bag_bigger_gray');
					done();
				}
			);
		});

		test('does not accept non-bag class TSIDs', function () {
			assert.throw(function () {
				Bag.create('pi');
			}, assert.AssertionError);
		});
	});


	suite('addToSlot', function () {

		test('adds whole itemstack to empty slot', function (done) {
			var i = new Item({tsid: 'I1'});
			var b = new Bag({tsid: 'B1'});
			new RC().run(function (done) {
				var merged = b.addToSlot(i, 3);
				assert.strictEqual(merged, 1);
				assert.deepEqual(b.items, {I1: i});
				assert.strictEqual(i.slot, 3);
				assert.strictEqual(i.x, 3);
				assert.strictEqual(i.container, b);
			}, done);
		});

		test('merges partial itemstack with existing item', function (done) {
			new RC().run(function (done) {
				var i1 = Item.create('apple', 5);
				var i2 = Item.create('apple', 8);
				var b = Bag.create('bag_bigger_gray');
				i1.setContainer(b);
				i1.slot = 3;
				var merged = b.addToSlot(i2, 3, 2);
				assert.strictEqual(merged, 2);
				assert.strictEqual(i1.count, 7);
				assert.strictEqual(i1.container, b);
				assert.strictEqual(i2.count, 6);
				assert.isUndefined(i2.container);
			}, done);
		});

		test('does not add more than stackmax', function (done) {
			new RC().run(function (done) {
				var i = Item.create('apple', 80);
				i.stackmax = 30;
				var b = Bag.create('bag_bigger_gray');
				var merged = b.addToSlot(i, 0);
				assert.strictEqual(merged, 30);
				assert.strictEqual(b.getSlot(0).class_tsid, 'apple');
				assert.notStrictEqual(b.getSlot(0).tsid, i.tsid);
				assert.strictEqual(b.getSlot(0).count, 30);
				assert.strictEqual(i.count, 50);
			}, done);
		});

		test('does not merge incompatible items', function (done) {
			new RC().run(function (done) {
				var i1 = Item.create('apple', 5);
				var i2 = Item.create('pi');
				var b = Bag.create('bag_bigger_gray');
				i1.setContainer(b);
				i1.slot = 3;
				var merged = b.addToSlot(i2, 3);
				assert.strictEqual(merged, 0);
				assert.strictEqual(i1.count, 5);
				assert.strictEqual(i1.container, b);
				assert.strictEqual(i2.count, 1);
				assert.isUndefined(i2.container);
			}, done);
		});
	});
});
