'use strict';

var pers = require('data/pers');
var RC = require('data/RequestContext');
var RQ = require('data/RequestQueue');
var pbeMock = require('../../mock/pbe');
var Group = require('model/Group');
var gsjsBridge = require('model/gsjsBridge');
var utils = require('utils');


suite('Group', function () {

	setup(function () {
		gsjsBridge.reset();
		pers.init(pbeMock);
		RQ.init();
	});

	teardown(function () {
		gsjsBridge.reset();
		pers.init();  // disable mock back-end
		RQ.init();
	});


	suite('create', function () {

		test('does its job', function (done) {
			new RC().run(
				function () {
					var g = Group.create('rook_attack', 'somehub');
					assert.isTrue(utils.isGroup(g));
					assert.strictEqual(g.class_tsid, 'rook_attack');
					assert.strictEqual(g.hubid, 'somehub');
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

		test('works without the optional parameters', function (done) {
			new RC().run(function () {
				var g = Group.create();
				assert.notProperty(g, 'class_tsid');
				assert.notProperty(g, 'hubid');
			}, done);
		});
	});


	suite('unload', function () {

		test('works as intended', function (done) {
			var g;
			var rq;
			new RC().run(
				function () {
					g = Group.create('group');
					rq = g.getRQ();
				},
				function (err) {
					if (err) return done(err);
					/* eslint-disable max-nested-callbacks */
					g.unload(function (err2) {
						if (err2) return done(err2);
						assert.isTrue(rq.closing);
						setTimeout(function checkRqShutown() {
							// RQ is closed in rq.next, whch is scheduled
							// *after* this callback (via setImmediate)
							assert.isUndefined(RQ.get(g.tsid, true));
							done();
						}, 10);
					});
					/* eslint-enable max-nested-callbacks */
				}
			);
		});
	});
});
