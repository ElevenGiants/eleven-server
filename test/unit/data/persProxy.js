var rewire = require('rewire');
var pp = rewire('data/persProxy');
var rcMock = require('../../mock/requestContext');


suite('persProxy', function() {

	setup(function() {
		rcMock.reset();
		pp.__set__('reqContext', rcMock);
	});
	
	teardown(function() {
		pp.__set__('reqContext', require('data/requestContext'));
	});


	suite('makeProxy', function() {
	
		test('wraps game objects in persistence proxy', function() {
			var p = pp.makeProxy({
				a: 13,
			});
			assert.isTrue(p.__isPP);
			assert.strictEqual(p.a, 13, 'regular property read access');
		});
		
		test('deleting properties flags object as dirty', function() {
			var o = {tsid: 'x', a: 7};
			var p = pp.makeProxy(o);
			delete p.a;
			assert.notProperty(o, 'a');
			assert.deepEqual(rcMock.getDirtyList(), ['x']);
		});
		
		test('setting properties flags object as dirty', function() {
			var o = {tsid: 'x', a: 7};
			var p = pp.makeProxy(o);
			p.a = 8;
			assert.strictEqual(o.a, 8);
			assert.deepEqual(rcMock.getDirtyList(), ['x']);
		});
		
		test('certain property names are excluded from flagging object as dirty', function() {
			var o = {
				tsid: 'P123',
				x: 13,
				'!test': 123,
				nested: {
					x: 1,
				},
			};
			var p = pp.makeProxy(o);
			p['!test'] = 'abc';
			assert.strictEqual(o['!test'], 'abc');
			assert.deepEqual(rcMock.getDirtyList(), []);
			p.x = 12;
			assert.strictEqual(o.x, 12);
			assert.deepEqual(rcMock.getDirtyList(), []);
			p.nested.x = 2;
			assert.strictEqual(o.nested.x, 2);
			assert.deepEqual(rcMock.getDirtyList(), ['P123'],
				'nested x/y properties *should* trigger dirty flag');
		});
		
		test('objref props are excluded from flagging object as dirty', function() {
			var o = {
				tsid: 'x',
				or: {
					objref: true,
					tsid: 'GXYZ',
					__isORP: true,  // fake objref proxy
				},
			};
			var p = pp.makeProxy(o);
			p.or.label = 'ASDF';
			assert.strictEqual(o.or.label, 'ASDF');
			assert.deepEqual(rcMock.getDirtyList(), [],
				'accessing objrefs should not trigger dirty flag');
			assert.notProperty(o.or, '__isPP');
		});
		
		test('object-type props are permanently pers-proxified on access', function() {
			var o = {nested: {a: 1}};
			var p = pp.makeProxy(o);
			var dummy = p.nested.a;
			assert.isTrue(o.nested.__isPP);
		});
		
		test('read-only access does not flag object as dirty', function() {
			var o = {
				a: 1,
				b: {c: 3},
			};
			var p = pp.makeProxy(o);
			var dummy = p.a + p.b.c;
			assert.deepEqual(rcMock.getDirtyList(), []);
		});
		
		test('works with array-type properties too', function() {
			var o = {
				tsid: 'x',
				arr: [
					{x: 1},
					[1, 2, 3],
				],
			};
			var p = pp.makeProxy(o);
			var dummy = p.arr[0].x + p.arr[1][0];
			assert.strictEqual(dummy, 2);
			assert.isTrue(o.arr.__isPP, 'array-type property is proxified');
			assert.instanceOf(o.arr, Array, 'still an Array');
			assert.isTrue(o.arr[0].__isPP);
			assert.deepEqual(rcMock.getDirtyList(), []);
			p.arr.push('foo');
			assert.strictEqual(o.arr[2], 'foo');
			assert.deepEqual(rcMock.getDirtyList(), ['x']);
			rcMock.reset();
			delete p.arr[0];
			assert.deepEqual(rcMock.getDirtyList(), ['x']);
		});
		
		test('pproxy does not break JSON.stringify', function() {
			var o = {
				tsid: 'x',
				arr: [
					{x: 1},
					[1, 2, 3],
				],
			};
			var p = pp.makeProxy(o);
			p.arr[0].x = 3;
			assert.strictEqual(JSON.stringify(p),
				'{"tsid":"x","arr":[{"x":3},[1,2,3]]}');
		});
	});
});
