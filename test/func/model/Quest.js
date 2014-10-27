'use strict';

var gsjsBridge = require('model/gsjsBridge');
var RC = require('data/RequestContext');
var Geo = require('model/Geo');
var Location = require('model/Location');
var Quest = require('model/Quest');
var pers = require('data/pers');
var utils = require('utils');
var pbeMock = require('../../mock/pbe');


suite('Quest', function () {

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
					var l = Location.create(Geo.create());
					var q = Quest.create('beer_guzzle', l);
					assert.isTrue(q.__isPP);
					assert.isTrue(utils.isQuest(q));
					assert.strictEqual(q.class_tsid, 'beer_guzzle');
					assert.strictEqual(q.owner, l);
				},
				function cb(err, res) {
					if (err) return done(err);
					var db = pbeMock.getDB();
					assert.strictEqual(pbeMock.getCounts().write, 3);
					assert.strictEqual(Object.keys(db).length, 3);
					done();
				}
			);
		});

		test('fails on invalid owner type', function () {
			assert.throw(function () {
				new RC().run(function () {
					var geo = Geo.create();
					Quest.create('beer_guzzle', geo);
				});
			}, assert.AssertionError);
		});
	});
});
