'use strict';

var Session = require('comm/Session');
var getDummySocket = require('../../helpers').getDummySocket;


suite('session', function() {


	suite('ctor', function() {
		
		test('creates and adds new Session object', function() {
			var socket = getDummySocket();
			var s = new Session('test', socket);
			assert.isString(s.id);
			assert.isNumber(s.ts);
			assert.include(s.dom.members, socket);
		});
	});
	
	
	suite('onSocketClose', function() {
	
		test('is called when socket closes', function(done) {
			var socket = getDummySocket();
			var s = new Session('test', socket);
			s.on('close', function(arg) {
				assert.strictEqual(arg, s);
				done();
			});
			socket.emit('close');
		});
	});
	
	
	suite('onSocketData', function() {
	
		test('calls data handler function with incoming socket data', function(done) {
			var socket = getDummySocket();
			var s = new Session('test', socket, function dataHandler(session, data) {
				assert.strictEqual(session, s);
				assert.strictEqual(data.toString(), 'asdf');
				done();
			});
			socket.write('asdf');
		});
	});
	
	
	suite('handleError', function() {
	
		test('handles socket errors', function(done) {
			var socket = getDummySocket();
			socket.destroy = function() {
				// this should be called by the domain error handler
				done();
			};
			var s = new Session('test', socket);
			socket.emit('error', new Error('ECONNRESET'));
		});
		
		test('handles errors in our code', function(done) {
			var socket = getDummySocket();
			socket.destroy = function() {
				// this should be called by the domain error handler
				done();
			};
			var s = new Session('test', socket, function dataHandler(data) {
				throw new Error('something bad happened while processing a request');
			});
			// simulate incoming data
			socket.emit('data', 'crash!');
		});
	});
});
