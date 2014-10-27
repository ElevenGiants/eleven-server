'use strict';

var gsjsBridge = require('model/gsjsBridge');
var RC = require('data/RequestContext');
var Item = require('model/Item');
var pers = require('data/pers');
var utils = require('utils');
var pbeMock = require('../../mock/pbe');


suite('Item', function () {

	suite('create', function () {

		setup(function () {
			gsjsBridge.reset();
			pers.init(pbeMock);
		});

		teardown(function () {
			gsjsBridge.reset();
			pers.init();  // disable mock back-end
		});


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
});
