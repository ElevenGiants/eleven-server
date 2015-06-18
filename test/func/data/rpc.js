'use strict';

var net = require('net');
var rewire = require('rewire');
var config = require('config');
var rpc = rewire('data/rpc');
var persMock = require('../../mock/pers');
var RC = require('data/RequestContext');
var rcMock = require('../../mock/RequestContext');
var GameObject = require('model/GameObject');
var gsjsBridge = require('model/gsjsBridge');


suite('rpc', function () {

	var CONFIG = {net: {
		gameServers: {
			gs01: {host: '127.0.0.1', ports: [3000, 3001]},
		},
		rpc: {basePort: 17000, timeout: 10000},
	}};
	// fake client GS connection to make rpc module establish client
	// connection to its own server:
	var GSCONF_LOOPBACK = {
		gsid: 'gs01-loopback',  // different from actual GSID to trick rpc module
		host: '127.0.0.1',
	};

	var cfgBackup;

	suiteSetup(function () {
		cfgBackup = config.get();
		config.reset();
	});

	suiteTeardown(function () {
		config.init(false, cfgBackup, {});
	});


	suite('initialization and shutdown', function () {

		test('works', function (done) {
			config.init(true, CONFIG, {});
			// start up RPC server
			rpc.__get__('initServer')(function serverStarted() {
				// start up RPC client (with fake config to connect back to
				// the server we just started)
				rpc.__get__('initClient')(GSCONF_LOOPBACK, function clientStarted() {
					assert.deepEqual(Object.keys(rpc.__get__('clients')),
						['gs01-loopback'], 'exactly one client endpoint initialized');
					// multitransport-jsonrpc specific stuff:
					var client = rpc.__get__('clients')['gs01-loopback'];
					assert.deepEqual(client.transport.tcpConfig,
						{host: '127.0.0.1', port: 17000});
					var server = rpc.__get__('server');
					assert.strictEqual(Object.keys(server.transport.connections).length,
						1, 'exactly one client connected to server');
					var connection = server.transport.connections[Object.keys(
						server.transport.connections)[0]];
					assert.isTrue(connection.remoteAddress === '127.0.0.1' ||
						connection.remoteAddress === '::ffff:127.0.0.1');
					assert.strictEqual(connection.remotePort,
						client.transport.con.localPort,
						'server and client endpoints are connected');
					// test shutdown, too
					rpc.shutdown(function callback() {
						assert.deepEqual(rpc.__get__('clients'), {});
						// multitransport-jsonrpc specific stuff:
						assert.isTrue(client.transport.con.destroyed);
						done();
					});
				});
			});
		});
	});


	suite('function calls', function () {

		setup(function (done) {
			rcMock.reset();
			// enable mock persistence layer
			rpc.__set__('pers', persMock);
			persMock.reset();
			// set up client/server loopback connection within the same process
			// (as a worker process so it is managing the test game objects)
			config.init(false, CONFIG, {gsid: 'gs01-01'});
			rpc.__get__('initServer')(function serverStarted() {
				// meddle with base port to get a loopback client in worker process
				require('nconf').overrides({net: {rpc: {basePort: 17001}}});
				rpc.__get__('initClient')(GSCONF_LOOPBACK, function clientStarted() {
					done();
				});
				require('nconf').overrides({});  // reset
			});
		});

		teardown(function (done) {
			rcMock.reset();
			persMock.reset();
			rpc.__set__('pers', require('data/pers'));
			rpc.shutdown(function callback() {
				done();
			});
		});


		test('dummy function', function (done) {
			var server = rpc.__get__('server');
			var client = rpc.__get__('clients')['gs01-loopback'];
			server.register('dummyFunc', function (a, b, callback) {
				callback(null, a + b);
			});
			client.register('dummyFunc');
			client.dummyFunc(2, 3, function (err, result) {
				assert.strictEqual(result, 5);
				done(err);
			});
		});

		test('function call on actual game object', function (done) {
			// make fake client RPC connection available under our own GSID (so
			// requests on objects we are managing go to our own RPC server):
			rpc.__get__('clients')['gs01-02'] = rpc.__get__('clients')['gs01-loopback'];
			// create dummy object with a test function (we're the only
			// configured GS, so we are authoritative for it):
			var go = new GameObject({
				tsid: 'LXYZ',
				foo: function (a, b) {
					return a + b;
				},
			});
			persMock.preAdd(go);
			rcMock.run(function () {
				var res = rpc.sendObjRequest(go, 'foo', [17, 4]);
				assert.strictEqual(res, 21, 'function is actually called');
			}, null, null, done);
		});

		test('return null if called function returns undefined', function (done) {
			rpc.__get__('clients')['gs01-02'] = rpc.__get__('clients')['gs01-loopback'];
			persMock.preAdd(new GameObject({
				tsid: 'LXYZ',
				func: function () {},  // implicitly returns undefined
			}));
			rcMock.run(function () {
				var res = rpc.sendObjRequest('LXYZ', 'func', []);
				assert.isNull(res, 'undefined (unknown in JSON) is converted to null');
			}, null, null, done);
		});

		test('return proper RPC result object if called function returns undefined',
			function (done) {
			persMock.preAdd(new GameObject({
				tsid: 'LXYZ',
				func: function () {},  // implicitly returns undefined
			}));
			var socket = net.connect({port: 17001}, function () {
				socket.on('data', function (data) {
					var length = data.readUInt32BE(0);
					var s = data.toString('utf8', 4);
					assert.strictEqual(s.length, length);
					var res = JSON.parse(s);
					assert.strictEqual(res.id, 123);
					assert.isNull(res.error, 'no error occurred');
					assert.isNull(res.result,
						'response contains result property with value null');
					done();
				});
				var msg = JSON.stringify({method: 'obj',
					params: ['foo', 'LXYZ', 'func', []], id: 123});
				var length = Buffer.byteLength(msg);
				var buf = new Buffer(4 + length);
				buf.writeUInt32BE(length, 0);
				buf.write(msg, 4, length, 'utf8');
				socket.write(buf);
			});
		});

		test('handles invalid (non-array) args parameter gracefully',
			function (done) {
			persMock.preAdd(new GameObject({
				tsid: 'LX',
				func: function () {
					return 'foo';
				},
			}));
			rcMock.run(function () {
				rpc.__get__('objectRequest')('caller', 'LX', 'func', null,
					function cb(err, res) {
					if (err) return done(err);
					assert.strictEqual(res, 'foo');
					done();
				});
			});
		});
	});


	suite('model API function calls', function () {

		setup(function (done) {
			// set up client/server loopback connection within the same process
			config.init(false, CONFIG, {gsid: 'gs01-01', gsjs: {config: 'config_prod'}});
			gsjsBridge.init(true);
			rpc.__get__('initServer')(function serverStarted() {
				// meddle with base port to get a loopback client in worker process
				require('nconf').overrides({net: {rpc: {basePort: 17001}}});
				rpc.__get__('initClient')(GSCONF_LOOPBACK, function clientStarted() {
					// make fake client RPC connection available under our own GSID
					rpc.__get__('clients')['gs01-02'] =
						rpc.__get__('clients')['gs01-loopback'];
					done();
				});
				require('nconf').overrides({});  // reset
			});
		});

		teardown(function (done) {
			gsjsBridge.reset();
			rpc.shutdown(function callback() {
				done();
			});
		});


		test('apiFindItemPrototype retrieves catalog objects properly',
			function (done) {
			new RC().run(function () {
				var res = rpc.sendRequest('gs01-02', 'api',
					['apiFindItemPrototype', ['catalog']]);
				assert.notProperty(res, 'objref', 'return value is not an objref');
				assert.isObject(res, 'class_tsids');
			}, done);
		});

		test('apiGetJSFileObject returns object prototypes (not objrefs)',
			function (done) {
			new RC().run(function () {
				var res = rpc.sendRequest('gs01-02', 'api',
					['apiGetJSFileObject', ['achievements/able_chopper.js']]);
				assert.notProperty(res, 'objref', 'return value is not an objref');
				assert.strictEqual(res.category, 'cooking');
				res = rpc.sendRequest('gs01-02', 'api',
					['apiGetJSFileObject', ['items/apple.js']]);
				assert.notProperty(res, 'objref', 'return value is not an objref');
				assert.property(res.verbs, 'lick');
			}, done);
		});

		test('apiFindQuestPrototype returns quest prototypes (not objrefs)',
			function (done) {
			new RC().run(function () {
				var res = rpc.sendRequest('gs01-02', 'api',
					['apiFindQuestPrototype', ['an_autumn_day']]);
				assert.notProperty(res, 'objref', 'return value is not an objref');
				assert.strictEqual(res.title, 'An Autumn Day');
			}, done);
		});
	});
});
