'use strict';

var events = require('events');


exports.getDummySocket = function getDummySocket() {
	var ret = new events.EventEmitter();
	ret.write = function write(data) {
		ret.emit('data', data);  // simple echo
	};
	ret.setNoDelay = function setNoDelay() {};  // dummy
	return ret;
}
