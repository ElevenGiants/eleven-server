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

	setup(function () {
		gsjsBridge.reset();
		pers.init(pbeMock);
	});

	teardown(function () {
		gsjsBridge.reset();
		pers.init();  // disable mock back-end
	});


	suite('ctor', function () {

		test('does not override changed prototype properties', function () {
			/*jshint -W055 */  // deliberate lowercase constructor name here
			var ctor = gsjsBridge.getProto('quests', 'lightgreenthumb_1').constructor;
			var q = new ctor({accepted: true, class_tsid: 'lightgreenthumb_1'});
			assert.strictEqual(q.accepted, true);
			/*jshint +W055 */
		});
	});


	suite('create', function () {

		test('does its job', function (done) {
<<<<<<< HEAD
			new RC().run(
				function () {
					var l = Location.create({geo: Geo.create()});
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
=======
			new RC().run(function () {
				var l = Location.create(Geo.create());
				var q = Quest.create('beer_guzzle', l);
				assert.isTrue(utils.isQuest(q));
				assert.strictEqual(q.class_tsid, 'beer_guzzle');
				assert.strictEqual(q.owner, l);
			}, done);
>>>>>>> aroha/WIP_less-proxying-pers-on-unload
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
