'use strict';

var rewire = require('rewire');
var sessionMgr = rewire('comm/sessionMgr');
var getDummySocket = require('../../helpers').getDummySocket;
var gsjsBridge = require('model/gsjsBridge');


suite('sessionMgr', function () {

	suiteSetup(function () {
		gsjsBridge.reset({gsjsMain: {
			processMessage: function dummy() {},
		}});
	});

	suiteTeardown(function () {
		gsjsBridge.reset();
		// just in case any other test relies on sessionMgr
		sessionMgr.init();
	});

	setup(function () {
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


	suite('forEachSession', function () {

		test('works as expected', function (done) {
			var called = [];
			var s1 = sessionMgr.newSession(getDummySocket());
			var s2 = sessionMgr.newSession(getDummySocket());
			var s3 = sessionMgr.newSession(getDummySocket());
			s1.loggedIn = true;
			s2.loggedIn = false;  // function not called for this one
			s3.loggedIn = true;
			sessionMgr.forEachSession(
				function check(session, cb) {
					called.push(session.id);
					cb();
				},
				function cb(err, res) {
					assert.sameMembers(called, [s1.id, s3.id]);
					return done(err);
				}
			);
		});
	});


	suite('sendToAll', function () {

		test('works as expected', function (done) {
			var s1 = sessionMgr.newSession(getDummySocket());
			s1.loggedIn = true;
			s1.send = function (msg) {
				throw new Error('should be ignored');
			};
			var s2 = sessionMgr.newSession(getDummySocket());
			s2.loggedIn = true;
			s2.send = function (msg) {
				assert.deepEqual(msg, {blerg: 1, txt: 'blah'});
				done();
			};
			sessionMgr.sendToAll({blerg: 1, txt: 'blah'});
		});
	});
});
