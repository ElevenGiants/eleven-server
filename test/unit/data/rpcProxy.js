var rewire = require('rewire');
var rp = rewire('data/rpcProxy');
var rpcMock = require('../../mock/rpc');


suite('rpcProxy', function() {

	setup(function() {
		rpcMock.reset();
		rp.__set__('rpc', rpcMock);
	});
	
	teardown(function() {
		rp.__set__('rpc', require('data/rpc'));
	});


	suite('makeProxy/proxyGet', function() {
	
		test('wraps objects in RPC proxy', function() {
			var p = rp.makeProxy({
				toString: function() { return 'foo'; },
			});
			assert.isTrue(p.__isRP);
			assert.strictEqual(p.toString(), '^Rfoo');
		});
		
		test('does not wrap already proxied objects', function() {
			assert.throw(function() {
				rp.makeProxy(rp.makeProxy({}));
			}, assert.AssertionError);
		});
		
		test('regular (non-function) property access is not remoted', function() {
			var o = {a: 13, b: {c: 'foo'}};
			var p = rp.makeProxy(o);
			assert.strictEqual(p.a, 13);
			assert.strictEqual(p.b.c, 'foo');
			p.a = 12;
			assert.strictEqual(p.a, 12);
			p.x = null;
			assert.strictEqual(p.x, null);
			assert.strictEqual(o.x, null);
			assert.strictEqual(rpcMock.getRequests().length, 0);
		});
		
		test('access to functions inherited from Object is not remoted', function() {
			var p = rp.makeProxy({});
			p.hasOwnProperty('foo');
			p.isPrototypeOf({});
			p.propertyIsEnumerable('asdf');
			assert.strictEqual(rpcMock.getRequests().length, 0);
		});
		
		test('function access is remoted', function() {
			var o = {
				gumbo: function(a, b) { return a + b; },
			};
			var p = rp.makeProxy(o);
			var res = p.gumbo(1, 2);
			assert.strictEqual(res, 3);
			assert.deepEqual(rpcMock.getRequests()[0],
				{obj: o, fname: 'gumbo', args: [1, 2]});
		});
		
		test('function arguments are sent as an Array', function() {
			var p = rp.makeProxy({
				test: function(a, b, c) {},
			});
			p.test(1, 2, 3);
			var args = rpcMock.getRequests()[0].args;
			assert.deepEqual(args, [1, 2, 3]);
			assert.instanceOf(args, Array);
		});
	});
});
