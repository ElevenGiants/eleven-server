'use strict';

var gsjsBridge = require('model/gsjsBridge');
var RC = require('data/RequestContext');
var Item = require('model/Item');
var pers = require('data/pers');
var utils = require('utils');
var pbeMock = require('../../mock/pbe');


suite('Item', function () {

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
					var it = Item.create('pi', 7);
					assert.isTrue(it.__isPP);
					assert.isTrue(utils.isItem(it));
					assert.strictEqual(it.class_tsid, 'pi');
					assert.strictEqual(it.constructor.name, 'pi');
					assert.strictEqual(it.count, 7);
				},
				function cb(err, res) {
					if (err) return done(err);
					var db = pbeMock.getDB();
					assert.strictEqual(pbeMock.getCounts().write, 1);
					assert.strictEqual(Object.keys(db).length, 1);
					assert.strictEqual(db[Object.keys(db)[0]].class_tsid, 'pi');
					done();
				}
			);
		});

		test('count defaults to 1', function (done) {
			new RC().run(function () {
				assert.strictEqual(Item.create('apple').count, 1);
			}, done);
		});

		test('does not accept bag class TSIDs', function () {
			assert.throw(function () {
				Item.create('bag_bigger_gray');
			}, assert.AssertionError);
		});
	});


	suite('split', function () {

		test('works as intended', function (done) {
			new RC().run(function () {
				var it = new Item({class_tsid: 'apple', count: 5});
				var split = it.split(3);
				assert.notStrictEqual(it.tsid, split.tsid);
				assert.strictEqual(split.class_tsid, 'apple');
				assert.strictEqual(it.count, 2);
				assert.strictEqual(split.count, 3);
			}, done);
		});

		test('handles invalid arguments gracefully', function (done) {
			new RC().run(function () {
				var it = new Item({class_tsid: 'apple', count: 5});
				assert.isUndefined(it.split(0));
				assert.isUndefined(it.split(-1));
				assert.isUndefined(it.split('three'));
				assert.isUndefined(it.split(5));
				assert.strictEqual(it.count, 5);
			}, done);
		});

		test('transfers soulbound attribute to new item', function (done) {
			new RC().run(function () {
				var it = new Item({class_tsid: 'apple', count: 5,
					is_soulbound_item: true, soulbound_to: 'Garfield'});
				var split = it.split(1);
				assert.isTrue(split.is_soulbound_item);
				assert.strictEqual(split.soulbound_to, 'Garfield');
				assert.strictEqual(split.count, 1);
			}, done);
		});

		test('returns undefined for non-stackable items', function () {
			var it = new Item({class_tsid: 'trant_bubble'});
			assert.isUndefined(it.split(1));
		});
	});


	suite('merge', function () {

		test('does its job', function (done) {
			new RC().run(function () {
				var from = Item.create('apple', 5);
				var to = Item.create('apple', 1);
				var res = to.merge(from, 3);
				assert.strictEqual(res, 3);
				assert.strictEqual(from.count, 2);
				assert.strictEqual(to.count, 4);
				assert.isFalse(from.deleted);
				res = to.merge(from, 7);
				assert.strictEqual(res, 2);
				assert.strictEqual(from.count, 0);
				assert.strictEqual(to.count, 6);
				assert.isTrue(from.deleted);
			}, done);
		});

		test('respects max stack size', function (done) {
			new RC().run(function () {
				var from = Item.create('apple', 100);
				var to = Item.create('apple', 10);
				to.stackmax = 20;
				var res = to.merge(from, 100);
				assert.strictEqual(res, 10);
				assert.strictEqual(from.count, 90);
				assert.strictEqual(to.count, 20);
			}, done);
		});

		test('ignores attempts to merge into non-stack items', function (done) {
			new RC().run(function () {
				var it = new Item({class_tsid: 'trant_bean'});
				var res = it.merge(new Item({class_tsid: 'trant_bean'}), 1);
				assert.strictEqual(res, 0);
				assert.strictEqual(it.count, 1);
			}, done);
		});

		test('handles invalid arguments gracefully', function (done) {
			new RC().run(function () {
				var it = new Item({class_tsid: 'apple', count: 5});
				assert.strictEqual(it.merge(new Item({class_tsid: 'banana'}), 1), 0);
				assert.strictEqual(it.merge(new Item({class_tsid: 'trant_bean'}), 1), 0);
				assert.strictEqual(it.merge(new Item({class_tsid: 'apple'}), -3), 0);
				assert.strictEqual(it.merge(new Item({class_tsid: 'apple'}), 'foo'), 0);
				assert.strictEqual(it.count, 5);
			}, done);
		});

		test('does not merge items soulbound to different souls', function (done) {
			new RC().run(function () {
				var from = new Item({class_tsid: 'apple', count: 5, soulbound_to: 'me'});
				var to = new Item({class_tsid: 'apple', count: 5, soulbound_to: 'you'});
				assert.strictEqual(to.merge(from, 3), 0);
			}, done);
		});
	});
});
