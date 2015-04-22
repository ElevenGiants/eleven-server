'use strict';

var amf = require('node_amf_cc');
var config = require('config');
var Session = require('comm/Session');
var helpers = require('../../helpers');
var gsjsBridge = require('model/gsjsBridge');


var TEST_AMF3_MSG = ('0a 0b 01 09 74 79 70 65 06 09 74 65 73 74 0d 6d 73 67 ' +
	'5f 69 64 06 03 31 01').replace(/ /g, '');


suite('Session', function () {

	suiteSetup(function () {
		gsjsBridge.reset({gsjsMain: {
			processMessage: function dummy() {},
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

		test('stores data in internal buffer and triggers message handler',
			function (done) {
			var s = helpers.getTestSession('test');
			s.checkForMessages = function () {
				assert.property(s, 'buffer');
				assert.strictEqual(s.buffer.toString(), 'asdf');
				done();
			};
			s.socket.write(new Buffer('asdf'));
		});

		test('concatenates consecutive data chunks', function (done) {
			var s = helpers.getTestSession('test');
			var i = 0;
			s.checkForMessages = function () {
				if (i === 0) i++;
				else if (i === 1) {
					assert.strictEqual(s.buffer.toString(), 'asdfghjk');
					done();
				}
			};
			s.socket.write(new Buffer('asdf'));
			s.socket.write(new Buffer('ghjk'));
		});
	});


	suite('handleError', function () {

		test('handles socket errors', function (done) {
			var socket = helpers.getDummySocket();
			socket.destroy = function () {
				// this should be called by the domain error handler
				done();
			};
			new Session('test', socket);
			socket.emit('error', new Error('ECONNRESET'));
		});

		test('handles errors in our code', function (done) {
			var socket = helpers.getDummySocket();
			socket.destroy = function () {
				// this should be called by the domain error handler
				done();
			};
			var s = new Session('test', socket);
			s.checkForMessages = function (msg) {
				throw new Error('something bad happened while processing a request');
			};
			// simulate incoming data
			socket.emit('data', 'crash!');
		});
	});


	suite('checkForMessages', function () {

		test('deserializes one message', function (done) {
			var s = helpers.getTestSession('test');
			s.buffer = new Buffer(TEST_AMF3_MSG, 'hex');
			s.handleMessage = function (msg) {
				assert.deepEqual(msg, {type: 'test', msg_id: '1'});
				assert.notProperty(s, 'buffer');
				done();
			};
			s.checkForMessages();
		});

		test('deserializes multiple messages', function (done) {
			var s = helpers.getTestSession('test');
			var buf = new Buffer(TEST_AMF3_MSG, 'hex');
			s.buffer = Buffer.concat([buf, buf]);
			var i = 0;
			s.handleMessage = function (msg) {
				assert.deepEqual(msg, {type: 'test', msg_id: '1'});
				if (++i === 2) {
					assert.notProperty(s, 'buffer');
					done();
				}
			};
			s.checkForMessages();
		});

		test('preserves trailing incomplete messages in buffer', function (done) {
			var s = helpers.getTestSession('test');
			s.buffer = Buffer.concat([new Buffer(TEST_AMF3_MSG, 'hex'),
				new Buffer('foo')]);
			s.handleMessage = function (msg) {
				assert.deepEqual(msg, {type: 'test', msg_id: '1'});
				assert.strictEqual(s.buffer.toString(), 'foo');
				done();
			};
			s.checkForMessages();
		});

		test('fails on excessively large messages', function () {
			var s = helpers.getTestSession('test');
			s.buffer = new Buffer(new Array(config.get('net:maxMsgSize') + 2).join('X'));
			assert.throw(s.checkForMessages.bind(s), Error);
		});
	});


	suite('enqueueMessage', function () {

		test('enqueues regular messages', function (done) {
			var s = helpers.getTestSession('test');
			s.dequeueMessage = function stub() {
				assert.deepEqual(s.msgQueue, [{
					msg: {type: 'dummymsg'},
					waitTimer: {thing: 'dummyTimer'},
				}]);
				done();
			};
			s.handleMessage = function dummy(msg, timer, exclusive) {
				if (msg.type !== 'ping') {
					throw new Error('should not happen');
				}
			};
			s.enqueueMessage({type: 'ping'}, {thing: 'dummyTimer'});
			s.enqueueMessage({type: 'dummymsg'}, {thing: 'dummyTimer'});
		});
	});


	suite('dequeueMessage', function () {

		test('dequeues messages one by one', function () {
			var s = helpers.getTestSession('test');
			s.handleMessage = function check(msg, timer, exclusive) {
				assert.strictEqual(exclusive, true);
			};
			s.msgQueue = [
				{
					msg: {type: 'dummymsg'},
					waitTimer: {thing: 'dummyTimer'},
				},
				{
					msg: {type: 'dummy2'},
					waitTimer: {thing: 'dummyTimer'},
				},
			];
			s.dequeueMessage();
			assert.lengthOf(s.msgQueue, 1);
			s.dequeueMessage();
			assert.lengthOf(s.msgQueue, 0);
		});

		test('does nothing when called with empty queue', function () {
			var s = helpers.getTestSession('test');
			s.handleMessage = function check() {
				throw new Error('should not happen');
			};
			s.dequeueMessage();
		});

		test('does nothing when already busy processing a message', function () {
			var s = helpers.getTestSession('test');
			s.processRequest = function check() {
				throw new Error('should not happen');
			};
			s.msgQueue = [{
				msg: {type: 'dummymsg'},
				waitTimer: {thing: 'dummyTimer'},
			}];
			s.busy = true;
			s.dequeueMessage();
		});
	});


	suite('handleMessage', function () {

		test('handles errors with request error handler', function (done) {
			var s = helpers.getTestSession('test');
			s.processRequest = function () {
				throw new Error('boo');
			};
			s.handleAmfReqError = function (err, msg) {
				assert.strictEqual(err.message, 'boo');
				assert.strictEqual(msg.test, 'x');
				done();
			};
			s.handleMessage({test: 'x'});
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
			s.socket.destroy = function (msg) {
				assert.strictEqual(actionSent, 'CLOSE');
				done();
			};
			s.handleAmfReqError(new Error('foo'), {msg_id: 12, type: 'moo'});
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
			s.socket.destroy = done;
			s.handleAmfReqError(new Error('foo'));
		});
	});


	suite('send', function () {

		test('does its job', function (done) {
			var socket = helpers.getDummySocket();
			var s = helpers.getTestSession('test', socket);
			s.loggedIn = true;
			socket.write = function (data) {
				assert.strictEqual(data.toString('hex'), '0000001d0a0b0d4f626' +
					'a65637407666f6f06076261720d6d73675f696406033101');
				done();
			};
			s.send({foo: 'bar', msg_id: '1'});
		});

		test('does not send non-login messages until login is complete',
			function (done) {
			var socket = helpers.getDummySocket();
			var s = helpers.getTestSession('test', socket);
			socket.write = function (data) {
				data = data.slice(4);  // snip length header
				var res = amf.deserialize(data.toString('binary')).value;
				assert.notStrictEqual(res.type, 'foo1');
				if (res.type === 'foo2') {
					done();
				}
			};
			s.send({type: 'foo1'});  // not sent
			s.send({type: 'relogin_end'});
			s.send({type: 'foo2'});  // sent
		});
	});
});
