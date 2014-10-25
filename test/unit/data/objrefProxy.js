'use strict';

var rewire = require('rewire');
var GameObject = require('model/GameObject');
var orproxy = rewire('data/objrefProxy');
var persMock = require('../../mock/pers');
// workaround to make Proxy available in orproxy module after rewiring:
require('harmony-reflect');
orproxy.__set__('Proxy', Proxy);


suite('objrefProxy', function () {

	setup(function () {
		persMock.reset();
		orproxy.__set__('pers', persMock);
	});

	teardown(function () {
		orproxy.__set__('pers', require('data/pers'));
	});


	suite('makeProxy', function () {

		test('proxy does not resolve objref when accessing objref properties',
			function () {
			orproxy.__set__('pers', {
				get: function () {
					throw new Error('should not be called');
				},
			});
			var proxy = orproxy.makeProxy({tsid: 'TEST', data: 'refdata'});
			assert.strictEqual(proxy.data, 'refdata');
		});

		test('proxy resolves objref when accessing properties not contained ' +
			'in objref itself', function () {
			var proxy = orproxy.makeProxy({tsid: 'TEST'});
			persMock.add({tsid: 'TEST', data: 'objdata'});
			assert.strictEqual(proxy.data, 'objdata');
		});

		test('proxy throws error when referenced object is not available',
			function () {
			var proxy = orproxy.makeProxy({tsid: 'NOT_AVAILABLE'});
			assert.throw(function () {
				/*jshint -W030 */  // we're doing this on purpose here
				proxy.something;
			}, orproxy.ObjRefProxyError);
		});

		test('set and delete operations on proxy are reflected in referenced object',
			function () {
			var obj = {tsid: 'TEST'};
			persMock.add(obj);
			var proxy = orproxy.makeProxy({tsid: 'TEST'});
			proxy.thing = 'thump';
			assert.strictEqual(obj.thing, 'thump');
			delete proxy.thing;
			assert.notProperty(obj, 'thing');
		});

		test('construct/apply on a proxy throw an error', function () {
			/*jshint -W055 */  // this isn't a real constructor
			var proxy = orproxy.makeProxy(function () {});  // does not make sense anyway, but just in case...
			assert.throw(function () {
				new proxy();
			}, orproxy.ObjRefProxyError);
			assert.throw(function () {
				proxy.apply({}, [1, 2, 3]);
			}, orproxy.ObjRefProxyError);
		});

		test('Object.keys(proxy) returns referenced object\'s keys', function () {
			var obj = {tsid: 'TEST', a: 1, x: 2};
			persMock.add(obj);
			var proxy = orproxy.makeProxy({tsid: 'TEST'});
			assert.sameMembers(Object.keys(proxy), ['tsid', 'a', 'x']);
		});

		test('for loop on proxy loops over referenced object\'s properties',
			function () {
			var obj = {tsid: 'TEST', a: 1, b: 2};
			persMock.add(obj);
			var proxy = orproxy.makeProxy({tsid: 'TEST'});
			var l = [];
			for (var k in proxy) {
				l.push(k);
			}
			assert.sameMembers(l, ['tsid', 'a', 'b']);
		});

		test('"has" works on referenced object', function () {
			var obj = {tsid: 'TEST', x: 1};
			persMock.add(obj);
			var proxy = orproxy.makeProxy({tsid: 'TEST'});
			assert.isTrue('x' in proxy);
			assert.isFalse('y' in proxy);
		});

		test('"hasOwnProperty" works on referenced object', function () {
			var O = function () {};
			O.prototype.y = 2;
			var obj = new O();
			obj.tsid = 'TEST';
			obj.x = 1;
			persMock.add(obj);
			var proxy = orproxy.makeProxy({tsid: 'TEST'});
			assert.isTrue(proxy.hasOwnProperty('tsid'));
			assert.isTrue(proxy.hasOwnProperty('x'));
			assert.isFalse(proxy.hasOwnProperty('y'));
			assert.isTrue(({}).hasOwnProperty.call(proxy, 'tsid'));
			assert.isTrue(({}).hasOwnProperty.call(proxy, 'x'));
			assert.isFalse(({}).hasOwnProperty.call(proxy, 'y'));
		});
	});


	suite('proxify', function () {

		test('does not fail with non-object parameters', function () {
			var x = 5;
			orproxy.proxify(x);
			assert.strictEqual(x, 5);
			var y = 'y';
			orproxy.proxify(y);
			assert.strictEqual(y, 'y');
			var z = null;
			orproxy.proxify(z);
			assert.strictEqual(z, null);
		});

		test('does its job', function () {
			var x = {
				item1: {
					tsid: 'I88RBN5IGO3KDQU',
					label: 'Watering Can',
					objref: true
				},
				secondlevel: {
					item2: {
						tsid: 'IHVKNR85F603IR7',
						label: 'Random Kindness',
						objref: true
					},
				},
				anarray: [
					{
						tsid: 'IA510NRCAI32COC',
						label: 'Carrot',
						objref: true
					},
				]
			};
			orproxy.proxify(x);
			assert.isTrue(x.item1.__isORP);
			assert.isTrue(x.secondlevel.item2.__isORP);
			assert.isTrue(x.anarray[0].__isORP);
		});

		test('works on arrays too', function () {
			var x = [
				{tsid: 'IA510NRCAI32COC', objref: true},
				{tsid: 'IHVKNR85F603IR7', objref: true},
			];
			orproxy.proxify(x);
			assert.typeOf(x, 'array');
			assert.isTrue(x[0].__isORP);
			assert.isTrue(x[1].__isORP);
		});
	});


	suite('refify', function () {

		test('does its job', function () {
			var x = {
				child1: new GameObject({tsid: 'IA510NRCAI32COC'}),
				nested: {
					child2: new GameObject({tsid: 'IHVKNR85F603IR7'}),
				},
				fakeProxy: {tsid: 'IA510NRCAI32COC', __isORP: true},
				listed: [
					new GameObject({tsid: 'IHVKNR85F603IR7'}),
					new GameObject({tsid: 'IHVKNR85F603IR7'}),
				],
			};
			var res = orproxy.refify(x);
			assert.strictEqual(res.child1.objref, true);
			assert.strictEqual(res.nested.child2.objref, true);
			assert.strictEqual(res.fakeProxy.objref, true);
			assert.strictEqual(res.listed[0].objref, true);
			assert.strictEqual(res.listed[1].objref, true);
		});

		test('works on arrays too', function () {
			var x = [
				new GameObject({tsid: 'IHVKNR85F603IR7'}),
				new GameObject({tsid: 'IA510NRCAI32COC'}),
			];
			var res = orproxy.refify(x);
			assert.typeOf(res, 'array');
			assert.strictEqual(res[0].objref, true);
			assert.strictEqual(res[1].objref, true);
		});

		test('does not refify random things that happen to have a TSID property',
			function () {
			var x = {
				child: {tsid: 'ABCDE', label: 'not really a game object'},
			};
			assert.notProperty(orproxy.refify(x).child, 'objref');
		});

		test('works on GameObject instances directly', function () {
			var x = new GameObject({tsid: 'IA510NRCAI32COC'});
			var res = orproxy.refify(x);
			assert.strictEqual(res.objref, true);
		});

		test('does not modify the input object', function () {
			var x = {
				child1: new GameObject({tsid: 'IA510NRCAI32COC'}),
				child2: new GameObject({tsid: 'IHVKNR85F603IR7'}),
			};
			orproxy.refify(x);
			assert.notProperty(x.child1, 'objref');
			assert.notProperty(x.child2, 'objref');
		});

		test('does not fail with non-object input', function () {
			assert.strictEqual(orproxy.refify(5), 5);
			assert.strictEqual(orproxy.refify('y'), 'y');
			assert.strictEqual(orproxy.refify(null), null);
		});
	});
});
