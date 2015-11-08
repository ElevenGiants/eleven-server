'use strict';

var path = require('path');
var pers = require('data/pers');
var RC = require('data/RequestContext');
var pbeMock = require('../../mock/pbe');
var Geo = require('model/Geo');
var gsjsBridge = require('model/gsjsBridge');
var utils = require('utils');


suite('Geo', function () {

	setup(function (done) {
		pers.init(pbeMock, {backEnd: {
			module: 'pbeMock',
			config: {pbeMock: {
				fixturesPath: path.resolve(path.join(__dirname, '../fixtures')),
			}}
		}}, done);
	});

	teardown(function () {
		pers.init();  // disable mock back-end
	});


	suite('create', function () {

		setup(function () {
			gsjsBridge.reset();
		});

		teardown(function () {
			gsjsBridge.reset();
		});


		test('does its job', function (done) {
			new RC().run(
				function () {
					var g = Geo.create();
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


	suite('prepConnects', function () {

		this.slow(100);

		test('removes unavailable connects', function (done) {
			new RC().run(function () {
				var g = pers.get('GLI32G3NUTD100I');
				assert.notProperty(g.layers.middleground.doors, 'door_1300484753304');
				var signpost = g.layers.middleground.signposts.signpost_1;
				assert.deepEqual(signpost.connects, {});
			}, done);
		});
	});
});
