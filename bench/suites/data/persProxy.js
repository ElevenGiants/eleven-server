'use strict';

require('../../setup');
var suite = new (require('benchmark')).Suite;
module.exports = suite;
var fs = require('fs');
var rewire = require('rewire');
var pp = rewire('data/persProxy');
var Player = require('model/Player');
var rcMock = require('../../../test/mock/RequestContext');
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
var pc = new Player(JSON.parse(
	fs.readFileSync('bench/fixtures/PUVF8UK15083AI1XXX.json')));
var ppc = pp.makeProxy(new Player(JSON.parse(
	fs.readFileSync('bench/fixtures/PUVF8UK15083AI1XXX.json'))));


suite.on('start', function() {
	rcMock.reset();
	pp.__set__('RC', rcMock);
});

suite.on('complete', function() {
	pp.__set__('RC', require('data/RequestContext'));
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

suite.add('serialize pProxied player', function() {
	ppc.serialize();
});

suite.add('serialize non-pProxied player', function() {
	pc.serialize();
});
