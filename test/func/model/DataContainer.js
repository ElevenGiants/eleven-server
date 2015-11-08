'use strict';

var gsjsBridge = require('model/gsjsBridge');
var RC = require('data/RequestContext');
var Group = require('model/Group');
var Geo = require('model/Geo');
var DataContainer = require('model/DataContainer');
var pers = require('data/pers');
var utils = require('utils');
var pbeMock = require('../../mock/pbe');


suite('DataContainer', function () {

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
					var group = Group.create();
					var dc = DataContainer.create(group);
					assert.isTrue(utils.isDC(dc));
					assert.strictEqual(dc.owner, group);
				},
				function cb(err, res) {
					if (err) return done(err);
					var db = pbeMock.getDB();
					assert.strictEqual(pbeMock.getCounts().write, 2);
					assert.strictEqual(Object.keys(db).length, 2);
					done();
				}
			);
		});

		test('fails on invalid owner type', function () {
			assert.throw(function () {
				new RC().run(function () {
					var geo = Geo.create();
					DataContainer.create(geo);
				});
			}, assert.AssertionError);
		});
	});
});
