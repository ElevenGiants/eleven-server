'use strict';

var config = require('config');
var Session = require('comm/Session');
var getDummySocket = require('../../helpers').getDummySocket;


var TEST_AMF3_MSG = ('0a 0b 01 09 74 79 70 65 06 09 74 65 73 74 0d 6d 73 67 ' +
	'5f 69 64 06 03 31 01').replace(/ /g, '');


function getTestSession(id, socket) {
	// creates a Session instance throwing errors (the regular error handler
	// obscures potential test errors, making debugging difficult)
	var ret = new Session(id, socket);
	ret.handleError = function (err) {
		throw err;
	};
	ret.dom.on('error', ret.handleError.bind(ret));
	return ret;
}


suite('session', function () {


	suite('ctor', function () {

		test('creates and adds new Session object', function () {
			var socket = getDummySocket();
			var s = getTestSession('test', socket);
			assert.isString(s.id);
			assert.isNumber(s.ts);
			assert.include(s.dom.members, socket);
		});
	});


	suite('onSocketClose', function () {

		test('is called when socket closes', function (done) {
			var socket = getDummySocket();
			var s = getTestSession('test', socket);
			s.on('close', function (arg) {
				assert.strictEqual(arg, s);
				done();
			});
			socket.emit('close');
		});
	});


	suite('onSocketData/handleData', function () {

		test('stores data in internal buffer and triggers message handler',
			function (done) {
			var socket = getDummySocket();
			var s = getTestSession('test', socket);
			s.checkForMessages = function () {
				assert.property(s, 'buffer');
				assert.strictEqual(s.buffer.toString(), 'asdf');
				done();
			};
			socket.write(new Buffer('asdf'));
		});

		test('concatenates consecutive data chunks', function (done) {
			var socket = getDummySocket();
			var s = getTestSession('test', socket);
			var i = 0;
			s.checkForMessages = function () {
				if (i === 0) i++;
				else if (i === 1) {
					assert.strictEqual(s.buffer.toString(), 'asdfghjk');
					done();
				}
			};
			socket.write(new Buffer('asdf'));
			socket.write(new Buffer('ghjk'));
		});
	});


	suite('handleError', function () {

		test('handles socket errors', function (done) {
			var socket = getDummySocket();
			socket.destroy = function () {
				// this should be called by the domain error handler
				done();
			};
			new Session('test', socket);
			socket.emit('error', new Error('ECONNRESET'));
		});

		test('handles errors in our code', function (done) {
			var socket = getDummySocket();
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
			var s = getTestSession('test', getDummySocket());
			s.buffer = new Buffer(TEST_AMF3_MSG, 'hex');
			s.handleMessage = function (msg) {
				assert.deepEqual(msg, {type: 'test', msg_id: '1'});
				assert.notProperty(s, 'buffer');
				done();
			};
			s.checkForMessages();
		});

		test('deserializes multiple messages', function (done) {
			var s = getTestSession('test', getDummySocket());
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
			var s = getTestSession('test', getDummySocket());
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
			var s = getTestSession('test', getDummySocket());
			s.buffer = new Buffer(new Array(config.get('net:maxMsgSize') + 2).join('X'));
			assert.throw(s.checkForMessages.bind(s), Error);
		});
	});


	suite('handleMessage', function () {

		test('handles errors with request error handler', function (done) {
			var s = getTestSession('test', getDummySocket());
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


	suite('handleAmfReqError', function () {

		test('sends error response', function (done) {
			var s = getTestSession('test', getDummySocket());
			s.pc = 'xyz';
			s.send = function (msg) {
				assert.deepEqual(msg, {
					msg_id: 12,
					type: 'moo',
					success: false,
					msg: 'foo',
				});
				done();
			};
			s.handleAmfReqError(new Error('foo'), {id: 12, type: 'moo'});
		});
	});


	suite('send', function () {

		test('does its job', function (done) {
			var socket = getDummySocket();
			var s = getTestSession('test', socket);
			socket.write = function (data) {
				assert.strictEqual(data.toString('hex'), '0000001f0a0b0d4f626' +
					'a65637409747970650609746573740d6d73675f696406033101');
				done();
			};
			s.send({type: 'test', msg_id: '1'});
		});
	});
});
