'use strict';

var pers = require('data/pers');
var RC = require('data/RequestContext');
var pbeMock = require('../../mock/pbe');
var Group = require('model/Group');
var gsjsBridge = require('model/gsjsBridge');
var utils = require('utils');


suite('Group', function () {

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
			new RC().run(function () {
				var g = Group.create('rook_attack', 'somehub');
				assert.isTrue(utils.isGroup(g));
				assert.strictEqual(g.class_tsid, 'rook_attack');
				assert.strictEqual(g.hubid, 'somehub');
			}, done);
		});

		test('works without the optional parameters', function (done) {
			new RC().run(function () {
				var g = Group.create();
				assert.notProperty(g, 'class_tsid');
				assert.notProperty(g, 'hubid');
			}, done);
		});
	});
});
