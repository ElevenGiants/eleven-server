'use strict';

var _ = require('lodash');
var rewire = require('rewire');
var RC = require('data/RequestContext');
var utils = require('utils');
var GameObject = require('model/GameObject');
var Item = require('model/Item');
var Bag = require('model/Bag');
var Player = require('model/Player');
var orproxy = rewire('data/objrefProxy');
var pers = require('data/pers');
var pbeMock = require('../mock/pbe');


suite('utils', function () {

	suite('makeTsid', function () {

		test('does its job', function () {
			assert.strictEqual(utils.makeTsid('G', 'gs01-01')[0], 'G');
			assert.strictEqual(utils.makeTsid('p', 'gs01-02')[0], 'P');
			assert.isTrue(utils.makeTsid('X', 'gs01-01').length >= 18);
		});

		test('fails with invalid parameters', function () {
			assert.throw(function () {
				utils.makeTsid();
			}, assert.AssertionError);
			assert.throw(function () {
				utils.makeTsid('');
			}, assert.AssertionError);
			assert.throw(function () {
				utils.makeTsid(1);
			}, assert.AssertionError);
			assert.throw(function () {
				utils.makeTsid('XY', 'abc');
			}, assert.AssertionError);
			assert.throw(function () {
				utils.makeTsid('A');
			}, assert.AssertionError);
			assert.throw(function () {
				utils.makeTsid('A', null);
			}, assert.AssertionError);
			assert.throw(function () {
				utils.makeTsid('A', '');
			}, assert.AssertionError);
		});

		test('consecutive calls never return same TSID', function () {
			this.slow(400);  // prevent mocha from flagging this test as slow
			var tsid, prev;
			for (var i = 0; i < 100; i++) {
				prev = tsid;
				tsid = utils.makeTsid('L', 'gs01-01');
				assert.notStrictEqual(tsid, prev);
			}
		});
	});


	suite('checkUniqueGsidHashes', function () {

		test('does its job', function () {
			utils.checkUniqueHashes(['gs01', 'gs01-01', 'gs02', 'gs02-01', 'gs02-02']);
			assert.throw(function () {
				utils.checkUniqueHashes(['abc', 'def', 'ghi', 'abc']);
			}, assert.AssertionError);
		});
	});


	suite('copyProps', function () {

		test('does its job', function () {
			var O = function () {
				this.z = 3;
			};
			O.prototype.f = _.noop;
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

		test('works as intended on prototypes', function () {
			var O = _.noop;
			var P = _.noop;
			O.prototype.f = _.noop;
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

		test('only makes shallow copies of properties', function () {
			var o = {o: {s: 'everybodyshake'}};
			var p = {};
			utils.copyProps(o, p);
			o.o.s = 'shaken';
			assert.strictEqual(p.o.s, 'shaken');
		});
	});


	suite('isInt', function () {

		test('confirms that ints are ints', function () {
			assert.isTrue(utils.isInt(123));
			assert.isTrue(utils.isInt(-10));
			assert.isTrue(utils.isInt(-0));
			assert.isTrue(utils.isInt(0));
			assert.isTrue(utils.isInt(0x1f));
			assert.isTrue(utils.isInt(1e9));
		});

		test('works for strings too', function () {
			assert.isTrue(utils.isInt('123'));
			assert.isTrue(utils.isInt('-10'));
			assert.isTrue(utils.isInt('0x1f'));
		});

		test('returns false for non-integer numbers', function () {
			assert.isFalse(utils.isInt(1e-9));
			assert.isFalse(utils.isInt(0.1));
			assert.isFalse(utils.isInt('.1'));
		});

		test('returns false for anything else', function () {
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


	suite('intVal', function () {

		test('works as expected', function () {
			assert.strictEqual(utils.intVal('0'), 0);
			assert.strictEqual(utils.intVal('123'), 123);
			assert.strictEqual(utils.intVal(' 123'), 123);
			assert.strictEqual(utils.intVal('0123'), 123);
			assert.strictEqual(utils.intVal('-17'), -17);
			assert.strictEqual(utils.intVal('1e3'), 1,
				'does not handle exponential notation as one might expect');
			assert.strictEqual(utils.intVal('1e-3'), 1);
		});

		test('works for number-type input, too', function () {
			assert.strictEqual(utils.intVal(0), 0);
			assert.strictEqual(utils.intVal(10.12), 10);
			assert.strictEqual(utils.intVal(1e4), 10000);
		});

		test('fails with non-finite/NaN and other invalid values', function () {
			assert.throw(function () {
				utils.intVal('blubb');
			}, Error);
			assert.throw(function () {
				utils.intVal(-1 / 0);
			}, Error);
			assert.throw(function () {
				utils.intVal('');
			}, Error);
			assert.throw(function () {
				utils.intVal(undefined);
			}, Error);
			assert.throw(function () {
				utils.intVal(null);
			}, Error);
		});
	});


	suite('makeNonEnumerable', function () {

		test('does its job', function () {
			var o = {x: 1, y: 2};
			utils.makeNonEnumerable(o, 'y');
			assert.deepEqual(Object.keys(o), ['x']);
			assert.isTrue(o.hasOwnProperty('y'));
			for (var k in o) {
				assert.notStrictEqual(k, 'y');
			}
		});

		test('non-enumerable sticks even when reassigning value', function () {
			var o = {x: {y: 'blah'}};
			utils.makeNonEnumerable(o, 'x');
			o.x = {a: 'blub'};
			assert.strictEqual(o.x.a, 'blub', 'assignment actually works');
			assert.isFalse(o.propertyIsEnumerable('x'), 'still not enumerable');
		});
	});


	suite('addNonEnumerable', function () {

		setup(function () {
			pers.init(pbeMock);
		});

		teardown(function () {
			pers.init();  // disable mock back-end
		});


		test('does its job', function () {
			var o = {x: 12};
			utils.addNonEnumerable(o, 'y', 'argl');
			assert.strictEqual(o.y, 'argl');
			assert.deepEqual(Object.keys(o), ['x']);
		});

		test('creates writable properties', function () {
			var o = {};
			utils.addNonEnumerable(o, 'y', 'argl');
			assert.strictEqual(o.y, 'argl');
			o.y = 'moo';
			assert.strictEqual(o.y, 'moo');
		});

		test('does not break key enumeration on objref proxies', function (done) {
			new RC().run(function () {
				var o = {tsid: 'G1'};
				utils.addNonEnumerable(o, 'xyz', 1);
				pbeMock.getDB()[o.tsid] = o;
				var p = orproxy.makeProxy(o);
				// the following line throws an error if the object contains
				// non-configurable properties (which the proxy target (i.e. the
				// objref) does not contain):
				// "TypeError: ownKeys trap failed to include non-configurable property 'xyz'"
				var keys = Object.keys(p);
				assert.include(keys, 'tsid');
				assert.notInclude(keys, 'xyz');
			}, done);
		});
	});


	suite('isBag', function () {

		test('does its job', function () {
			assert.isTrue(utils.isBag(new Bag()));
			assert.isTrue(utils.isBag(new Player()));
			assert.isFalse(utils.isBag(new GameObject()));
			assert.isTrue(utils.isBag('BXYZ'));
			assert.isFalse(utils.isBag('ASDF'));
			assert.isFalse(utils.isBag('bXYZ', 'case sensitive'));
		});

		test('does not resolve objref', function () {
			orproxy.__set__('pers', {
				get: function () {
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


	suite('arrayToHash', function () {

		test('does its job', function () {
			var a = [{tsid: 'X'}, {tsid: 'Y'}, {tsid: 'Z', test: 'foo'}];
			assert.deepEqual(utils.arrayToHash(a), {
				X: {tsid: 'X'},
				Y: {tsid: 'Y'},
				Z: {tsid: 'Z', test: 'foo'},
			});
		});

		test('throws an error when an object does not have a TSID', function () {
			var a = [1, 'x', {b: 'moo'}];
			assert.throw(function () {
				utils.arrayToHash(a);
			}, Error);
		});

		test('works with undefined/null input', function () {
			assert.deepEqual(utils.arrayToHash(), {});
			assert.deepEqual(utils.arrayToHash(null), {});
		});
	});


	suite('hashToArray', function () {

		test('does its job', function () {
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

		test('works with undefined/null input', function () {
			assert.deepEqual(utils.hashToArray(), []);
			assert.deepEqual(utils.hashToArray(null), []);
		});
	});


	suite('shallowCopy', function () {

		test('does its job', function () {
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

		test('does not copy functions and inherited properties', function () {
			var O = function () {
				this.a = 'A';
				this.f = _.noop;
			};
			O.b = 'B';
			var o = new O();
			var oc = utils.shallowCopy(o);
			assert.notProperty(oc, 'f', 'does not copy functions');
			assert.property(oc, 'a');
			assert.notProperty(oc, 'b', 'does not copy inherited props');
		});

		test('fails on invalid parameter types', function () {
			var vals = [null, 1, 'x', [1, 2, 3], _.noop];
			for (var i = 0; i < vals.length; i++) {
				/* eslint-disable no-loop-func */  // oh well, it's just a test
				assert.throw(
					function () {
						utils.shallowCopy(vals[i]);
					},
					assert.AssertionError, undefined, '' + vals[i]
				);
				/* eslint-enable no-loop-func */
			}
		});
	});


	suite('padLeft', function () {

		test('does its job', function () {
			assert.strictEqual(utils.padLeft('', 'x', 5), 'xxxxx');
			assert.strictEqual(utils.padLeft('A', 'x', 5), 'xxxxA');
			assert.strictEqual(utils.padLeft('A', 'x', 0), 'A');
			assert.strictEqual(utils.padLeft(24, 0, 4), '0024');
			assert.strictEqual(utils.padLeft(1234, 0, 2), '1234');
		});
	});


	suite('gameObjArgToList', function () {

		test('works as expected', function () {
			var arg = {
				I1: new Item({tsid: 'I1'}),
				G1: new GameObject({tsid: 'G1'}),
				B1: new Bag({tsid: 'B1'}),
				F1: {tsid: 'F1', not: 'a real GameObject'},
			};
			assert.sameMembers(utils.gameObjArgToList(arg), ['I1', 'G1', 'B1']);
		});

		test('applies the given filter function', function () {
			var arg = [
				new Item({tsid: 'I1'}),
				new Player({tsid: 'P1'}),
				new Bag({tsid: 'B1'}),
			];
			assert.sameMembers(utils.gameObjArgToList(arg, utils.isBag), ['P1', 'B1']);
			assert.sameMembers(utils.gameObjArgToList(arg, utils.isPlayer), ['P1']);
			assert.sameMembers(utils.gameObjArgToList(arg, utils.isGeo), []);
		});
	});


	suite('playersArgToList', function () {

		test('works with a player hash', function () {
			var arg = {
				P1: new Player({tsid: 'P1'}),
				P2: new Player({tsid: 'P2'}),
				P3: new Player({tsid: 'P3'}),
			};
			var res = utils.playersArgToList(arg);
			assert.sameMembers(res, ['P1', 'P2', 'P3']);
		});

		test('works with a player array', function () {
			var arg = [
				new Player({tsid: 'P1'}),
				new Player({tsid: 'P2'}),
				new Player({tsid: 'P3'}),
			];
			var res = utils.playersArgToList(arg);
			assert.sameMembers(res, ['P1', 'P2', 'P3']);
		});

		test('works with a TSID array', function () {
			var arg = ['PX', 'P123', 'PASDF'];
			var res = utils.playersArgToList(arg);
			assert.sameMembers(res, ['PX', 'P123', 'PASDF']);
		});

		test('works with a single Player instance', function () {
			var res = utils.playersArgToList(new Player({tsid: 'PPP'}));
			assert.sameMembers(res, ['PPP']);
		});

		test('works with a single player TSID string', function () {
			var res = utils.playersArgToList('PFOO');
			assert.sameMembers(res, ['PFOO']);
		});

		test('does not include non-player TSIDs', function () {
			var arg = ['PASD', 'PXY', 'p213', 'IYXC'];
			var res = utils.playersArgToList(arg);
			assert.sameMembers(res, ['PASD', 'PXY']);
		});

		test('handles invalid/unexpected input gracefully', function () {
			assert.deepEqual(utils.playersArgToList(), []);
			assert.deepEqual(utils.playersArgToList([]), []);
			assert.deepEqual(utils.playersArgToList({}), []);
			assert.deepEqual(utils.playersArgToList('asdf'), []);
			assert.deepEqual(utils.playersArgToList(123), []);
			assert.deepEqual(utils.playersArgToList(null), []);
			assert.deepEqual(utils.playersArgToList(new Bag()), []);
		});
	});


	suite('pointOnPlat', function () {

		var platform = {
			start: {x: 10, y: 10},
			end: {x: 20, y: 20},
			platform_pc_perm: 1,
			platform_item_perm: 1,
		};

		test('works within basic platform bounds', function () {
			assert.equal(utils.pointOnPlat(platform, 9), undefined);
			assert.deepEqual(utils.pointOnPlat(platform, 10), {x: 10, y: 10});
			assert.deepEqual(utils.pointOnPlat(platform, 20), {x: 20, y: 20});
			assert.equal(utils.pointOnPlat(platform, 21), undefined);
			assert.deepEqual(utils.pointOnPlat(platform, 15), {x: 15, y: 15});
		});

		test('is unaffected by permeability', function () {
			platform.platform_pc_perm = 0;
			assert.deepEqual(utils.pointOnPlat(platform, 10), {x: 10, y: 10});
			platform.platform_pc_perm = -1;
			assert.deepEqual(utils.pointOnPlat(platform, 10), {x: 10, y: 10});
			platform.platform_item_perm = -1;
			assert.deepEqual(utils.pointOnPlat(platform, 10), {x: 10, y: 10});
			platform.platform_item_perm = 0;
			assert.deepEqual(utils.pointOnPlat(platform, 10), {x: 10, y: 10});
		});
	});


	suite('typeGuard', function () {

		test('works as expected', function () {
			assert.deepEqual(utils.typeGuard({}), {});
			assert.deepEqual(utils.typeGuard([]), []);
			assert.deepEqual(utils.typeGuard({
				a: 'a', b: 1, c: null,
				d: undefined, e: -Infinity, f: NaN,
			}), {
				a: 'a', b: 1, c: null,
			});
			assert.deepEqual(utils.typeGuard({
				a: {b: 1, c: {x: undefined, y: 1}, d: ['z', [NaN]]},
			}), {
				a: {b: 1, c: {y: 1}, d: ['z', []]},
			});
			assert.deepEqual(utils.typeGuard({
				a: {b: 1, c: {x: undefined, y: 1}, d: ['z', [NaN]]},
			}, true), {
				a: {b: 1, c: {x: null, y: 1}, d: ['z', [null]]},
			});
		});

		test('modifies the given object in place', function () {
			var o = {a: 'a', b: 1, c: null, d: undefined, e: -Infinity, f: NaN};
			assert.deepEqual(utils.typeGuard(o), {a: 'a', b: 1, c: null});
			assert.deepEqual(o, {a: 'a', b: 1, c: null});
		});
	});
});
