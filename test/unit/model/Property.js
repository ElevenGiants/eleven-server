'use strict';

var Prop = require('model/Property');


suite('Property', function() {

	suite('ctor', function() {
	
		test('works with data object', function() {
			var p = new Prop('test', {});
			assert.strictEqual(p.label, 'test');
			assert.strictEqual(p.value, 0);
			assert.strictEqual(p.bottom, 0);
			assert.strictEqual(p.top, 0);
			p = new Prop('test', {value: -3, bottom: -7, top: 8000});
			assert.strictEqual(p.value, -3);
			assert.strictEqual(p.bottom, -7);
			assert.strictEqual(p.top, 8000);
			p = new Prop('', {top: 5, value: 3});
			assert.strictEqual(p.bottom, 3, 'unspecified limits are set to value');
		});
		
		test('works with single value as data', function() {
			var p = new Prop('test', 12);
			assert.strictEqual(p.value, 12);
			assert.strictEqual(p.bottom, 12);
			assert.strictEqual(p.top, 12);
		});
		
		test('works without data argument', function() {
			var p = new Prop('test');
			assert.strictEqual(p.value, 0);
			assert.strictEqual(p.bottom, 0);
			assert.strictEqual(p.top, 0);
		});
		
		test('non-integer arguments are rounded', function() {
			var p = new Prop('test', {value: -3.76, bottom: -5.1, top: 6.1e2});
			assert.strictEqual(p.value, -4);
			assert.strictEqual(p.bottom, -5);
			assert.strictEqual(p.top, 610);
		});
	});
	
	
	suite('setLimits', function() {
	
		test('does its job', function() {
			var p = new Prop('x', {bottom: 0, top: 10});
			p.setVal(11);
			assert.strictEqual(p.value, 0);
			p.setLimits(0, 11);
			p.setVal(11);
			assert.strictEqual(p.value, 11);
		});
		
		test('existing value is clamped to new limits', function() {
			var p = new Prop('x', {bottom: 1, top: 8, value: 5});
			p.setLimits(3, 4);
			assert.strictEqual(p.value, 4);
		});
		
		test('invalid limits throw an error', function() {
			assert.throw(function() {
				new Prop('foo').setLimits(3, 2);
			}, assert.AssertionError);
		});
	});
	
	
	suite('setVal', function() {
	
		test('sets value within limits', function() {
			var p = new Prop('a', {bottom: 0, top: 20});
			p.setVal(12);
			assert.strictEqual(p.value, 12);
			p.setVal(11.0001);
			assert.strictEqual(p.value, 11);
		});
		
		test('silently ignores values exceeding limits', function() {
			var p = new Prop('a', {bottom: 0, top: 20, value: 3});
			p.setVal(-12);
			assert.strictEqual(p.value, 3);
			p.setVal(22);
			assert.strictEqual(p.value, 3);
		});
	});
	
	
	suite('inc/dec', function() {
	
		test('do their job', function() {
			var p = new Prop('test', {bottom: 0, top: 100});
			var d = p.inc(12);
			assert.strictEqual(p.value, 12);
			assert.strictEqual(d, 12);
			d = p.inc(0.1);
			assert.strictEqual(p.value, 12);
			assert.strictEqual(d, 0);
			d = p.dec(3.87);
			assert.strictEqual(p.value, 9, 'inc/dec don\'t round, they floor');
			assert.strictEqual(d, -3);
			d = p.dec(30);
			assert.strictEqual(p.value, 0);
			assert.strictEqual(d, -9);
			d = p.inc(1000.1);
			assert.strictEqual(p.value, 100);
			assert.strictEqual(d, 100);
		});
	});
	
	
	suite('mult', function() {
	
		test('does its job', function() {
			var p = new Prop('test', {bottom: 0, top: 100});
			var d = p.mult(3);
			assert.strictEqual(p.value, 0);
			assert.strictEqual(d, 0);
			p.value = 5;
			d = p.mult(2.87);
			assert.strictEqual(p.value, 14);
			assert.strictEqual(d, 9);
			d = p.mult(0.5);
			assert.strictEqual(p.value, 7);
			assert.strictEqual(d, -7);
			d = p.mult(-1.6);
			assert.strictEqual(p.value, 0);
			assert.strictEqual(d, -7);
		});
	});
	
	
	suite('serialization', function() {
	
		test('JSON.stringify generates the right structure for Player json files', function() {
			var p = new Prop('test', {value: -3, bottom: -7, top: 8000});
			var procd = JSON.parse(JSON.stringify(p));
			assert.deepEqual(procd, {value: -3, bottom: -7, top: 8000, label: 'test'});
		});
		
		test('Property can be recreated from JSON.stringify data', function() {
			var p = new Prop('test', {value: -3, bottom: -7, top: 8000});
			var pclone = new Prop(p.label, JSON.parse(JSON.stringify(p)));
			assert.instanceOf(pclone, Prop);
			assert.strictEqual(pclone.label, p.label);
			assert.strictEqual(pclone.value, -3);
			assert.strictEqual(pclone.bottom, -7);
			assert.strictEqual(pclone.top, 8000);
		});
	});
});
