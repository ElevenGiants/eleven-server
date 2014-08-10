var rewire = require('rewire');
var utils = require('utils');
var GameObject = require('model/GameObject');
var Bag = require('model/Bag');
var Player = require('model/Player');
var orproxy = rewire('data/objrefProxy');


suite('utils', function() {
	
	suite('makeTsid', function() {
	
		test('does its job', function() {
			assert.strictEqual(utils.makeTsid('G')[0], 'G');
			assert.strictEqual(utils.makeTsid('p')[0], 'P');
			assert.isTrue(utils.makeTsid('X').length == 13);
		});
		
		test('fails with invalid parameters', function() {
			assert.throw(function() {
				utils.makeTsid();
			}, assert.AssertionError);
			assert.throw(function() {
				utils.makeTsid('');
			}, assert.AssertionError);
			assert.throw(function() {
				utils.makeTsid(1);
			}, assert.AssertionError);
			assert.throw(function() {
				utils.makeTsid('XY');
			}, assert.AssertionError);
		});
		
		test('consecutive calls never return same TSID', function() {
			this.slow(400);  // prevent mocha from flagging this test as slow
			var tsid, prev;
			for (var i = 0; i < 100; i++) {
				prev = tsid;
				tsid = utils.makeTsid('L');
				assert.notStrictEqual(tsid, prev);
			}
		});
	});
	
	
	suite('copyProps', function() {
	
		test('does its job', function() {
			var O = function() {
				this.z = 3;
			};
			O.prototype.f = function() {};
			O.prototype.x = 7;
			var o = new O();
			o.y = 13;
			o.o = {s: 'booya'};
			var o2 = {};
			utils.copyProps(o, o2);
			// own properties are copied
			assert.property(o2, 'z');
			assert.strictEqual(o2.z, 3);
			assert.property(o2, 'y');
			assert.strictEqual(o2.y, 13);
			assert.property(o2, 'o');
			assert.strictEqual(o2.o.s, 'booya');
			// inherited properties not copied
			assert.notProperty(o2, 'f');
			assert.notProperty(o2, 'x');
		});
		
		test('works as intended on prototypes', function() {
			var O = function() {};
			var P = function() {};
			O.prototype.f = function() {};
			O.prototype.x = 13;
			utils.copyProps(O.prototype, P.prototype);
			var p = new P();
			assert.property(P.prototype, 'f');
			assert.property(p, 'f');
			assert.strictEqual(typeof p.f, 'function');
			assert.property(P.prototype, 'x');
			assert.property(p, 'x');
			assert.strictEqual(p.x, 13);
		});
		
		test('only makes shallow copies of properties', function() {
			var o = {o: {s: 'everybodyshake'}};
			var p = {};
			utils.copyProps(o, p);
			o.o.s = 'shaken';
			assert.strictEqual(p.o.s, 'shaken');
		});
	});

	
	suite('copyProtoProps', function() {
	
		test('does its job', function() {
			var O = function() {};
			O.prototype.x = 13;
			O.y = 17;
			var P = function() {};
			utils.copyProtoProps(O, P);
			assert.property(P.prototype, 'x');
			assert.notProperty(P.prototype, 'y');
			assert.notProperty(P, 'y');
		});
	});
	
	
	suite('isInt', function() {
	
		test('confirms that ints are ints', function() {
			assert.isTrue(utils.isInt(123));
			assert.isTrue(utils.isInt(-10));
			assert.isTrue(utils.isInt(-0));
			assert.isTrue(utils.isInt(0));
			assert.isTrue(utils.isInt(023));  // octal
			assert.isTrue(utils.isInt(0x1f));
			assert.isTrue(utils.isInt(1e9));
		});
		
		test('works for strings too', function() {
			assert.isTrue(utils.isInt('123'));
			assert.isTrue(utils.isInt('-10'));
			assert.isTrue(utils.isInt('0x1f'));
		});
		
		test('returns false for non-integer numbers', function() {
			assert.isFalse(utils.isInt(1e-9));
			assert.isFalse(utils.isInt(0.1));
			assert.isFalse(utils.isInt('.1'));
		});
		
		test('returns false for anything else', function() {
			assert.isFalse(utils.isInt(''), 'empty string');
			assert.isFalse(utils.isInt('1a'), 'non-numeric string');
			assert.isFalse(utils.isInt(null), 'null');
			assert.isFalse(utils.isInt(undefined), 'undefined');
			assert.isFalse(utils.isInt(NaN), 'NaN');
			assert.isFalse(utils.isInt(Infinity), 'Infinity');
			assert.isFalse(utils.isInt(false), 'false');
			assert.isFalse(utils.isInt(true), 'true');
		});
	});
	
	
	suite('makeNonEnumerable', function() {
	
		test('does its job', function() {
			var o = {x: 1, y: 2};
			utils.makeNonEnumerable(o, 'y');
			assert.deepEqual(Object.keys(o), ['x']);
			assert.isTrue(o.hasOwnProperty('y'));
			for (var k in o) {
				assert.notStrictEqual(k, 'y');
			}
		});
		
		test('non-enumerable sticks even when reassigning value', function() {
			var o = {x: {'y': 'blah'}};
			utils.makeNonEnumerable(o, 'x');
			o.x = {'a': 'blub'};
			assert.strictEqual(o.x.a, 'blub', 'assignment actually works');
			assert.isFalse(o.propertyIsEnumerable('x'), 'still not enumerable');
		});
	});
	
	
	suite('addNonEnumerable', function() {
	
		test('does its job', function() {
			var o = {x: 12};
			utils.addNonEnumerable(o, 'y', 'argl');
			assert.strictEqual(o.y, 'argl');
			assert.deepEqual(Object.keys(o), ['x']);
		});
		
		test('creates writable properties', function() {
			var o = {};
			utils.addNonEnumerable(o, 'y', 'argl');
			assert.strictEqual(o.y, 'argl');
			o.y = 'moo';
			assert.strictEqual(o.y, 'moo');
		});
	});
	
	
	suite('isBag', function() {
		
		test('does its job', function() {
			assert.isTrue(utils.isBag(new Bag()));
			assert.isTrue(utils.isBag(new Player()));
			assert.isFalse(utils.isBag(new GameObject()));
			assert.isTrue(utils.isBag('BXYZ'));
			assert.isFalse(utils.isBag('ASDF'));
			assert.isFalse(utils.isBag('bXYZ', 'case sensitive'));
		});
		
		test('does not resolve objref', function() {
			orproxy.__set__('pers', {
				get: function() {
					throw new Error('should not be called');
				},
			});
			var proxy = orproxy.makeProxy({tsid: 'BTEST'});
			assert.isTrue(utils.isBag(proxy));
			proxy = orproxy.makeProxy({tsid: 'XTEST'});
			assert.isFalse(utils.isBag(proxy));
			orproxy.__set__('pers', require('data/pers'));  // restore
		});
	});
	
	
	suite('arrayToHash', function() {
	
		test('does its job', function() {
			var a = [{tsid: 'X'}, {tsid: 'Y'}, {tsid: 'Z', test: 'foo'}];
			assert.deepEqual(utils.arrayToHash(a), {
				X: {tsid: 'X'},
				Y: {tsid: 'Y'},
				Z: {tsid: 'Z', test: 'foo'},
			});
		});
		
		test('throws an error when an object does not have a TSID', function() {
			var a = [1, 'x', {b: 'moo'}];
			assert.throw(function() {
				utils.arrayToHash(a);
			}, Error);
		});
		
		test('works with undefined/null input', function() {
			assert.deepEqual(utils.arrayToHash(), {});
			assert.deepEqual(utils.arrayToHash(null), {});
		});
	});
	
	
	suite('hashToArray', function() {
	
		test('does its job', function() {
			var h = {
				X: {tsid: 'X'},
				Y: {tsid: 'Y'},
				Z: {tsid: 'Z', test: 'foo'},
			};
			assert.deepEqual(utils.hashToArray(h), [
				{tsid: 'X'},
				{tsid: 'Y'},
				{tsid: 'Z', test: 'foo'},
			]);
		});
		
		test('works with undefined/null input', function() {
			assert.deepEqual(utils.hashToArray(), []);
			assert.deepEqual(utils.hashToArray(null), []);
		});
	});
	
	
	suite('shallowCopy', function() {
	
		test('does its job', function() {
			var o = {
				p: {x: 1, y: 2},
				q: 3,
			};
			var oc = utils.shallowCopy(o);
			assert.deepEqual(oc, o);
			o.r = 'test';
			assert.notProperty(oc, 'r');
			o.p.z = 3;
			assert.strictEqual(oc.p.z, 3, 'just a shallow copy');
			oc.s = 'moo';
			assert.notProperty(o, 's');
		});
		
		test('does not copy functions and inherited properties', function() {
			var O = function() {
				this.a = 'A';
				this.f = function() {};
			};
			O.b = 'B';
			var o = new O();
			var oc = utils.shallowCopy(o);
			assert.notProperty(oc, 'f', 'does not copy functions');
			assert.property(oc, 'a');
			assert.notProperty(oc, 'b', 'does not copy inherited props');
		});
		
		test('fails on invalid parameter types', function() {
			var vals = [null, 1, 'x', [1, 2, 3], function() {}];
			for (var i = 0; i < vals.length; i++) {
				assert.throw(
					function() {
						utils.shallowCopy(vals[i]);
					},
					assert.AssertionError, undefined, '' + vals[i]
				);
			}
		});
	});
});
