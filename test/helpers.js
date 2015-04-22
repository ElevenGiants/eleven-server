'use strict';

var amf = require('node_amf_cc');
var events = require('events');
var Player = require('model/Player');
var Session = require('comm/Session');


exports.getDummySocket = function getDummySocket() {
	var ret = new events.EventEmitter();
	ret.write = function write(data) {
		ret.emit('data', data);  // simple echo
	};
	ret.setNoDelay = function setNoDelay() {};  // dummy
	ret.destroy = function destroy() {};  // dummy
	ret.end = function end() {};
	return ret;
};


exports.getTestSession = function getTestSession(id, socket) {
	// creates a Session instance throwing errors (the regular error handler
	// obscures potential test errors, making debugging difficult)
	if (!socket) socket = exports.getDummySocket();
	var ret = new Session(id, socket);
	ret.handleError = function (err) {
		throw err;
	};
	ret.dom.on('error', ret.handleError.bind(ret));
	return ret;
};


exports.getOnlinePlayer = function getOnlinePlayer(data) {
	// create a "connected" player instance with a dummy session object
	var ret = new Player(data);
	ret.session = {
		send: function send() {},
	};
	return ret;
};


exports.amfEnc = function amfEnc(data) {
	data = JSON.parse(JSON.stringify(data));
	data = amf.serialize(data);
	var ret = new Buffer(Buffer.byteLength(data, 'binary'));
	ret.write(data, 0, ret.length, 'binary');
	return ret;
};
