'use strict';

var OrderedHash = require('model/OrderedHash');


suite('OrderedHash', function () {

	suite('ctor', function () {

		test('creates OrderedHash', function () {
			var o = {x: 'x', y: 'y', z: 'z'};
			var oh = new OrderedHash(o);
			assert.strictEqual(oh.x, 'x');
			oh.q = 'q';
			assert.notProperty(o, 'q', 'new properties not added to source data object');
		});

		test('creates empty OrderedHash without parameter', function () {
			var oh = new OrderedHash();
			assert.strictEqual(oh.length(), 0);
		});

		test('JSON serialization skips everything but data properties', function () {
			var oh = new OrderedHash({x: 'x', yz: {y: 'y', z: 'z'}});
			assert.strictEqual(JSON.stringify(oh),
				'{"x":"x","yz":{"y":"y","z":"z"}}');
		});

		test('makes property enumeration iterate over keys in natural order', function () {
			var oh = new OrderedHash({z: 'z', a: 'a'});
			var keys = [];
			for (var k in oh) {
				keys.push(k);
			}
			assert.deepEqual(keys, ['a', 'z']);
			assert.deepEqual(Object.keys(oh), ['a', 'z']);
			oh.burp = 'b';
			oh['234'] = '123';
			keys = [];
			for (var j in oh) {
				keys.push(j);
			}
			assert.deepEqual(keys, ['234', 'a', 'burp', 'z']);
			assert.deepEqual(Object.keys(oh), ['234', 'a', 'burp', 'z']);
		});
	});


	suite('first', function () {

		test('does its job', function () {
			var oh = new OrderedHash({X: 'X', y: 'y', z: 'z'});
			assert.strictEqual(oh.first(), 'X');
			oh.A = 13;
			assert.strictEqual(oh.first(), 13);
		});
	});


	suite('last', function () {

		test('does its job', function () {
			var oh = new OrderedHash({X: 'X', y: 'y', z: 'z'});
			assert.strictEqual(oh.last(), 'z');
			oh.zzz = null;
			assert.strictEqual(oh.last(), null);
		});
	});


	suite('length', function () {

		test('does its job', function () {
			var oh = new OrderedHash();
			assert.strictEqual(oh.length(), 0);
			oh.x = 'x';
			assert.strictEqual(oh.length(), 1);
			oh.y = {y: 'y', z: 'z'};
			assert.strictEqual(oh.length(), 2);
			oh.u = undefined;
			assert.strictEqual(oh.length(), 3);
			delete oh.x;
			assert.strictEqual(oh.length(), 2);
		});
	});


	suite('clear', function () {

		test('does its job', function () {
			var oh = new OrderedHash({x: 'x', y: 'y', z: 'z'});
			oh.clear();
			assert.strictEqual(oh.length(), 0);
		});
	});
});
