var utils = require('utils');


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
});
