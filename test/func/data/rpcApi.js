'use strict';

var api = require('data/rpcApi');
var RC = require('data/RequestContext');
var pers = require('data/pers');
var pbeMock = require('../../mock/pbe');
var gsjsBridge = require('model/gsjsBridge');
var Geo = require('model/Geo');
var Location = require('model/Location');


suite('rpcApi', function () {

	this.slow(1000);  // player prototype loading takes some time

	setup(function () {
		gsjsBridge.init(true);
		pers.init(pbeMock);
	});

	teardown(function () {
		gsjsBridge.reset();
		pers.init();  // disable mock back-end
	});


	suite('createPlayer', function () {

		test('works as expected', function (done) {
			var g = new Geo({tsid: 'GLI32G3NUTD100I'});
			var l = new Location({tsid: 'LLI32G3NUTD100I'}, g);
			var db = pbeMock.getDB();
			db[g.tsid] = g;
			db[l.tsid] = l;
			var tsid;
			new RC().run(
				function () {
					tsid = api.createPlayer('1234', 'Venkman');
				},
				function cb(err, res) {
					if (err) return done(err);
					assert.property(db, tsid);
					var pc = db[tsid];
					assert.strictEqual(pc.userid, '1234');
					assert.strictEqual(pc.location.tsid, 'LLI32G3NUTD100I');
					assert.property(pc, 'av_meta');
					done();
				},
				true  // persist before callback
			);
		});
	});


	suite('getGsjsConfig', function () {

		test('works as expected', function (done) {
			new RC().run(function () {
				var cfg = api.getGsjsConfig();
				assert.isObject(cfg.physics_configs, 'from config_base.js');
				assert.isObject(cfg.music_map, 'from inc_data_sounds.js');
				assert.isObject(cfg.data_skills, 'from inc_data_skills.js');
			}, done);
		});
	});
});
