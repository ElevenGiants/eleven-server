'use strict';

var _ = require('lodash');
var config = require('config');
var Session = require('comm/Session');
var helpers = require('../../helpers');
var gsjsBridge = require('model/gsjsBridge');


suite('Session', function () {

	suiteSetup(function () {
		gsjsBridge.reset({gsjsMain: {
			processMessage: _.noop,
		}});
	});

	suiteTeardown(function () {
		gsjsBridge.reset();
	});


	suite('ctor', function () {

		test('creates and adds new Session object', function () {
			var s = helpers.getTestSession('test');
			assert.isString(s.id);
			assert.isNumber(s.ts);
			assert.include(s.dom.members, s.socket);
		});
	});


	suite('onSocketClose', function () {

		test('is called when socket closes', function (done) {
			var s = helpers.getTestSession('test');
			s.on('close', function (arg) {
				assert.strictEqual(arg, s);
				done();
			});
			s.socket.emit('close');
		});
	});


	suite('onSocketData/handleData', function () {

		test('triggers message handler on socket write', function (done) {
			var s = helpers.getTestSession('test');
			s.enqueueMessage = function (message) {
				assert.strictEqual(message.foo, 'bar');
				done();
			};
			s.socket.write(JSON.stringify({foo: "bar"}));
		});

		test('catch issues when parsing json message from socket data', function (done) {
			var s = helpers.getTestSession('test');
			s.socket.terminate = function (message) {
				done();
			}
			s.socket.write('invalid');
		});
	});


	suite('handleError', function () {

		test('handles socket errors', function (done) {
			var socket = helpers.getDummySocket();
			socket.terminate = function () {
				// this should be called by the domain error handler
				done();
			};
			new Session('test', socket);
			socket.emit('error', new Error('ECONNRESET'));
		});

		test('handles errors in our code', function (done) {
			var socket = helpers.getDummySocket();
			var s = new Session('test', socket);
			socket.terminate = function () {
				// this should be called by the domain error handler
				s.dom.exit();  // clean up (otherwise this domain affects other tests)
				done();
			};
			s.enqueueMessage = function (msg) {
				throw new Error('something bad happened while processing a request');
			};
			// simulate incoming data
			socket.emit('message', JSON.stringify({crash: "me"}));
		});
	});


	suite('enqueueMessage', function () {

		test('enqueues regular messages', function (done) {
			var s = helpers.getTestSession('test');
			s.pc = {
				getRQ: function getRQ() {
					return {
						push: function stub(tag, func, session, callback) {
							assert.deepEqual(tag, 'dummymsg');
							done();
						},
					};
				},
			};
			s.processRequest = function dummy(msg) {
				if (msg.type !== 'ping') {
					throw new Error('should not happen');
				}
			};
			s.enqueueMessage({type: 'ping'});
			s.enqueueMessage({type: 'dummymsg'});
		});

		test('handles errors with request error handler', function (done) {
			var s = helpers.getTestSession('test');
			s.processRequest = function () {
				throw new Error('boo');
			};
			s.handleAmfReqError = function (msg, err) {
				assert.strictEqual(err.message, 'boo');
				assert.strictEqual(msg.test, 'x');
				done();
			};
			s.enqueueMessage({test: 'x'});
		});
	});


	suite('preRequestProc', function () {

		test('handles ping request', function (done) {
			var s = helpers.getTestSession('test');
			s.send = function (msg) {
				assert.strictEqual(msg.type, 'ping');
				assert.strictEqual(msg.msg_id, 12);
				assert.isTrue(msg.success);
				assert.closeTo(msg.ts * 1000, new Date().getTime(), 1000);
				done();
			};
			var res = s.preRequestProc({type: 'ping', msg_id: 12});
			assert.isTrue(res);
		});
	});


	suite('handleAmfReqError', function () {

		test('sends CLOSE message', function (done) {
			var s = helpers.getTestSession('test');
			var actionSent;
			s.pc = {
				sendServerMsg: function (action) {
					actionSent = action;
				},
				isConnected: function () {
					return true;
				},
			};
			s.socket.terminate = function (msg) {
				assert.strictEqual(actionSent, 'CLOSE');
				done();
			};
			s.handleAmfReqError({msg_id: 12, type: 'moo'}, new Error('foo'));
		});

		test('does not send CLOSE message to offline player', function (done) {
			var s = helpers.getTestSession('test');
			s.pc = {
				sendServerMsg: function () {
					throw new Error('should not be called');
				},
				isConnected: function () {
					return false;
				},
			};
			s.socket.terminate = done;
			s.handleAmfReqError(undefined, new Error('foo'));
		});
	});


	suite('send', function () {

		test('does its job', function (done) {
			var socket = helpers.getDummySocket();
			var s = helpers.getTestSession('test', socket);
			s.loggedIn = true;
			socket.send = function (data) {
				assert.strictEqual(data, JSON.stringify({foo: 'bar', msg_id: '1'}));
				done();
			};
			s.send({foo: 'bar', msg_id: '1'});
		});

		test('does not send non-login messages until login is complete', function (done) {
			var socket = helpers.getDummySocket();
			var s = helpers.getTestSession('test', socket);
			socket.send = function (data) {
				data = JSON.parse(data);
				assert.notStrictEqual(data.type, 'foo1');
				if (data.type === 'foo2') {
					done();
				}
			};
			s.send({type: 'foo1'});  // not sent
			s.send({type: 'relogin_end'});
			s.send({type: 'foo2'});  // sent
		});
	});
});
