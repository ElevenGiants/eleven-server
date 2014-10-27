'use strict';

var pers = require('data/pers');
var RC = require('data/RequestContext');
var pbeMock = require('../../mock/pbe');
var Geo = require('model/Geo');
var gsjsBridge = require('model/gsjsBridge');
var utils = require('utils');


suite('Geo', function () {

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
					var g = Geo.create();
					assert.isTrue(g.__isPP);
					assert.isTrue(utils.isGeo(g));
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


		test('fails with invalid custom TSID', function () {
			assert.throw(function () {
				Geo.create({tsid: 'IXYZ'});
			}, assert.AssertionError);
		});
	});
});
