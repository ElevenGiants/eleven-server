'use strict';

var gsjsBridge = require('model/gsjsBridge');
var RC = require('data/RequestContext');
var Player = require('model/Player');
var Location = require('model/Location');
var Geo = require('model/Geo');
var pers = require('data/pers');
var utils = require('utils');
var pbeMock = require('../../mock/pbe');


suite('Player', function () {

	suite('create', function () {

		setup(function () {
			gsjsBridge.init(true);
			pers.init(pbeMock);
		});

		teardown(function () {
			gsjsBridge.reset();
			pers.init();  // disable mock back-end
		});


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
});
