'use strict';

require('../../setup');
var suite = new (require('benchmark')).Suite;
module.exports = suite;
var rewire = require('rewire');
var pp = rewire('data/persProxy');
var rcMock = require('../../../test/mock/requestContext');
// workaround to make Proxy available in persProxy module after rewiring:
require('harmony-reflect');
pp.__set__('Proxy', Proxy);


var obj = {
	tsid: 'PXYZ',
	a: 1,
	b: 2,
	c: {
		d: 3,
		e: {f: 4},
	},
};
obj = pp.makeProxy(obj);


suite.on('start', function() {
	rcMock.reset();
	pp.__set__('reqContext', rcMock);
});

suite.on('complete', function() {
	pp.__set__('reqContext', require('data/requestContext'));
});


suite.add('makeProxy', function() {
	pp.makeProxy({});
});

suite.add('pProxy get', function() {
	var x = obj.a;
});

suite.add('pProxy nested get', function() {
	var x = obj.c.e.f;
});

suite.add('pProxy get&set', function() {
	obj.a++;
});

suite.add('pProxy del&set', function() {
	delete obj.a;
	obj.a = 1;
});
