'use strict';

var gsjsBridge = require('model/gsjsBridge');
var RC = require('data/RequestContext');
var Bag = require('model/Bag');
var pers = require('data/pers');
var utils = require('utils');
var pbeMock = require('../../mock/pbe');


suite('Bag', function () {

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
});
