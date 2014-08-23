'use strict';

require('../../setup');
var suite = new (require('benchmark')).Suite;
module.exports = suite;
var fs = require('fs');
var GameObject = require('model/GameObject');
var gsjsBridge = require('model/gsjsBridge');


var f = fs.readFileSync('bench/fixtures/PUVF8UK15083AI1XXX.json');
var data = JSON.parse(f);
var go = new GameObject(data);
gsjsBridge.reset();
var proto = gsjsBridge.getProto('players', 'human');
var goWithProto = gsjsBridge.createFromData(data);


suite.add('GameObject instantiation (no parent prototypes)', function() {
	new GameObject(data);
});

suite.add('GameObject serialization (no parent prototypes)', function() {
	go.serialize();
});

suite.add('Player instantiation (with full prototype hierarchy)', function() {
	new proto.constructor(data);
});

suite.add('Player serialization (with full prototype hierarchy)', function() {
	goWithProto.serialize();
});
