'use strict';

var rewire = require('rewire');
var sessionMgr = rewire('comm/sessionMgr');
var getDummySocket = require('../../helpers').getDummySocket;


suite('sessionMgr', function () {

	setup(function () {
		sessionMgr.init();
	});

	suiteTeardown(function () {
		// just in case any other test relies on sessionMgr
		sessionMgr.init();
	});


	suite('newSession', function () {

		test('creates and adds new Session object', function () {
			var s = sessionMgr.newSession(getDummySocket());
			var sessions = sessionMgr.__get__('sessions');
			assert.isString(s.id);
			assert.isTrue(s.id.length >= 8);
			assert.strictEqual(sessionMgr.getSessionCount(), 1);
			assert.strictEqual(Object.keys(sessions)[0], s.id);
			assert.strictEqual(s.listeners('close')[0],
				sessionMgr.__get__('onSessionClose'));
		});
	});


	suite('onSessionClose', function () {

		test('does its job', function () {
			var s = sessionMgr.newSession(getDummySocket());
			assert.strictEqual(sessionMgr.getSessionCount(), 1);
			s.emit('close', s);
			assert.strictEqual(sessionMgr.getSessionCount(), 0);
		});
	});
});
