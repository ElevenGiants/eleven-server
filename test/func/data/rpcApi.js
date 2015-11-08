'use strict';

var api = require('data/rpcApi');
var RC = require('data/RequestContext');
var RQ = require('data/RequestQueue');
var pers = require('data/pers');
var pbeMock = require('../../mock/pbe');
var gsjsBridge = require('model/gsjsBridge');


suite('rpcApi', function () {

	this.timeout(5000);  // player prototype loading takes some time
	this.slow(1000);

	setup(function () {
		gsjsBridge.init(true);
		pers.init(pbeMock);
		RQ.init();
	});

	teardown(function () {
		gsjsBridge.reset();
		pers.init();  // disable mock back-end
		RQ.init();
	});


	suite('createPlayer', function () {

		test('works as expected', function (done) {
			var db = pbeMock.getDB();
			db.GLI32G3NUTD100I = {tsid: 'GLI32G3NUTD100I'};
			db.LLI32G3NUTD100I = {tsid: 'LLI32G3NUTD100I'};
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
