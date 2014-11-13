'use strict';

var globalApi = require('model/globalApi');
var orProxy = require('data/objrefProxy');


suite('globalApi', function () {

	suite('apiCopyHash', function () {

		test('works as expected (basic case)', function () {
			var x = {a: 12};
			var y = {b: 13, x: x};
			var clone = globalApi.apiCopyHash(y);
			assert.strictEqual(clone.b, 13);
			assert.strictEqual(clone.x.a, 12);
			assert.notStrictEqual(clone, y);
			assert.notStrictEqual(clone.x, y.x);
		});

		test('does not include prototype properties', function () {
			var O = function () {};
			O.prototype.x = 12;
			var o = new O();
			o.y = 13;
			assert.strictEqual(o.x, 12);
			var oc = globalApi.apiCopyHash(o);
			assert.notProperty(oc, 'x');
		});

		test('does not resolve objrefs', function () {
			var proxy = orProxy.makeProxy({
				objref: true,
				tsid: 'IUNAVAILABLE',
				label: 'lemmiwinks',
			});
			var o = {p: proxy};
			var oc = globalApi.apiCopyHash(o);  // if this would resolve the objref, it would fail (no request context)
			assert.strictEqual(oc.p.label, 'lemmiwinks');
			assert.isTrue(oc.p.__isORP, 'p is still an objref proxy');
		});

		test('handles circular references properly', function () {
			var o = {a: 'A'};
			var u = {o: o};
			o.o = o;
			o.u = u;
			var oc = globalApi.apiCopyHash(o);
			assert.strictEqual(oc.o, oc);
			assert.strictEqual(oc.u.o, oc);
		});
	});

});
