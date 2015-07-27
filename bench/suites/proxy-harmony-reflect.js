'use strict';

require('../setup');
var suite = new (require('benchmark')).Suite;
module.exports = suite;
require('harmony-reflect');


var o = {
	x: 13,
};

Object.defineProperty(o, 'y', {
	configurable: true,
	enumerable: true,
	get: function get() {
		return o.x;
	},
	set: function set(val) {
		o.x = val;
	},
});

var passthroughProxy = new Proxy(o, {});

var getSetProxy = new Proxy(o, {
	get: function get(target, name, receiver) {
		return target[name];
	},
	set: function set(target, name, val, receiver) {
		target[name] = val;
	},
});

var observed = {
	x: 13,
};
if (Object.observe) {
	Object.observe(observed, function observer(changes) {});
}


suite.add('plain object property write access', function() {
	o.x = 14;
});


suite.add('plain object property read access', function() {
	return o.x;
});


suite.add('plain object setter access', function() {
	o.y = 14;
});


suite.add('plain object getter access', function() {
	return o.y;
});


suite.add('passthroughProxy object property write access', function() {
	passthroughProxy.x = 15;
});


suite.add('passthroughProxy object property read access', function() {
	return passthroughProxy.x;
});


suite.add('getSetProxy object property write access', function() {
	getSetProxy.x = 17;
});


suite.add('getSetProxy object property read access', function() {
	return getSetProxy.x;
});


if (Object.observe) {
	suite.add('observed object property write access', function() {
		observed.x = 18;
	});


	suite.add('observed object property read access', function() {
		return observed.x;
	});
}
