'use strict';

var amf = require('amflib/node-amf/amf');
var events = require('events');


exports.getDummySocket = function getDummySocket() {
	var ret = new events.EventEmitter();
	ret.write = function write(data) {
		ret.emit('data', data);  // simple echo
	};
	ret.setNoDelay = function setNoDelay() {};  // dummy
	return ret;
};


exports.amfEnc = function amfEnc(data) {
	data = amf.serializer().writeObject(data);
	var ret = new Buffer(Buffer.byteLength(data, 'binary'));
	ret.write(data, 0, ret.length, 'binary');
	return ret;
};
