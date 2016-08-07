'use strict';

var _ = require('lodash');
var rewire = require('rewire');
var globalApi = rewire('model/globalApi');
var orProxy = require('data/objrefProxy');


suite('globalApi', function () {

	suite('safeClone', function () {

		var safeClone = globalApi.__get__('safeClone');

		test('works as expected (basic case)', function () {
			var x = {a: 12};
			var y = {b: 13, x: x};
			var clone = safeClone(y);
			assert.strictEqual(clone.b, 13);
			assert.strictEqual(clone.x.a, 12);
			assert.notStrictEqual(clone, y);
			assert.notStrictEqual(clone.x, y.x);
		});

		test('does not include prototype properties', function () {
			var O = _.noop;
			O.prototype.x = 12;
			var o = new O();
			o.y = 13;
			assert.strictEqual(o.x, 12);
			var oc = safeClone(o);
			assert.notProperty(oc, 'x');
		});

		test('does not resolve objrefs', function () {
			var proxy = orProxy.makeProxy({
				objref: true,
				tsid: 'IUNAVAILABLE',
				label: 'lemmiwinks',
			});
			var o = {p: proxy};
			var oc = safeClone(o);  // if this would resolve the objref, it would fail (no request context)
			assert.strictEqual(oc.p.label, 'lemmiwinks');
			assert.isTrue(oc.p.__isORP, 'p is still an objref proxy');
		});

		test('handles circular references properly', function () {
			var o = {a: 'A'};
			var u = {o: o};
			o.o = o;
			o.u = u;
			var oc = safeClone(o);
			assert.strictEqual(oc.o, oc);
			assert.strictEqual(oc.u.o, oc);
		});
	});


	suite('apiMD5', function () {

		test('works as expected', function () {
			assert.strictEqual(globalApi.apiMD5('asdasddfg'),
				'f85066a23fccd8a8b85ff9d761614923');
			assert.strictEqual(globalApi.apiMD5(''),
				'd41d8cd98f00b204e9800998ecf8427e');
		});
	});
});
