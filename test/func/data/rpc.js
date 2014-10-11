'use strict';

var rewire = require('rewire');
var config = require('config');
var rpc = rewire('data/rpc');
var persMock = require('../../mock/pers');
var rcMock = require('../../mock/RequestContext');
var GameObject = require('model/GameObject');


suite('rpc', function() {

	var CONFIG = {net: {
		gameServers: {
			gs01: {host: '127.0.0.1', ports: [3000]},
		},
		rpc: {basePort: 7000},
	}};
	// fake client GS connection to make rpc module establish client
	// connection to its own server:
	var GSCONF_LOOPBACK = {
		gsid: 'gs01-loopback',  // different from actual GSID to trick rpc module
		host: '127.0.0.1',
	};
	
	var cfgBackup;
	
	suiteSetup(function() {
		cfgBackup = config.get();
		config.reset();
	});
	
	suiteTeardown(function() {
		config.init(false, cfgBackup);
	});
	

	suite('initialization and shutdown', function() {
		
		test('works', function(done) {
			config.init(true, CONFIG, {});
			// start up RPC server
			rpc.__get__('initServer')(function serverStarted() {
				// start up RPC client (with fake config to connect back to
				// the server we just started)
				rpc.__get__('initClient')(GSCONF_LOOPBACK, function clientStarted() {
					assert.deepEqual(Object.keys(rpc.__get__('clients')), ['gs01-loopback'],
						'exactly one client endpoint initialized');
					// multitransport-jsonrpc specific stuff:
					var client = rpc.__get__('clients')['gs01-loopback'];
					assert.deepEqual(client.transport.tcpConfig, {host: '127.0.0.1', port: 7000});
					var server = rpc.__get__('server');
					assert.strictEqual(Object.keys(server.transport.connections).length, 1,
						'exactly one client connected to server');
					var connection = server.transport.connections[Object.keys(server.transport.connections)[0]];
					assert.strictEqual(connection.remoteAddress, '127.0.0.1');
					assert.strictEqual(connection.remotePort, client.transport.con.localPort,
						'server and client endpoints are connected');
					// test shutdown, too
					rpc.shutdown(function callback() {
						assert.isUndefined(rpc.__get__('server'));
						assert.deepEqual(rpc.__get__('clients'), {});
						// multitransport-jsonrpc specific stuff:
						assert.isFalse(server.transport.notClosed);
						assert.isTrue(client.transport.con.destroyed);
						done();
					});
				});
			});
		});
	});
	
	
	suite('function calls', function() {
	
		setup(function(done) {
			rcMock.reset();
			// enable mock persistence layer
			rpc.__set__('pers', persMock);
			persMock.reset();
			// set up client/server loopback connection within the same process
			// (as a worker process so it is managing the test game objects)
			config.init(false, CONFIG, {gsid: 'gs01-01'});
			rpc.__get__('initServer')(function serverStarted() {
				// meddle with base port to get a loopback client in worker process
				require('nconf').overrides({net: {rpc: {basePort: 7001}}});
				rpc.__get__('initClient')(GSCONF_LOOPBACK, function clientStarted() {
					done();
				});
				require('nconf').overrides({});  // reset
			});
		});

		teardown(function(done) {
			rcMock.reset();
			persMock.reset();
			rpc.__set__('pers', require('data/pers'));
			rpc.shutdown(function callback() {
				done();
			});
		});
		
		
		test('dummy function', function(done) {
			var server = rpc.__get__('server');
			var client = rpc.__get__('clients')['gs01-loopback'];
			server.register('dummyFunc', function(a, b, callback) {
				callback(null, a + b);
			});
			client.register('dummyFunc');
			client.dummyFunc(2, 3, function(err, result) {
				assert.strictEqual(result, 5);
				done(err);
			});
		});
		
		test('function call on actual game object', function(done) {
			// make fake client RPC connection available under our own GSID (so
			// requests on objects we are managing go to our own RPC server):
			rpc.__get__('clients')['gs01-01'] = rpc.__get__('clients')['gs01-loopback'];
			// create dummy object with a test function (we're the only
			// configured GS, so we are authoritative for it):
			var go = new GameObject({
				tsid: 'LXYZ',
				foo: function(a, b) { return a + b; },
			});
			persMock.preAdd(go);
			rcMock.run(function () {
				var res = rpc.sendRequest(go, 'foo', [17, 4]);
				assert.strictEqual(res, 21, 'function is actually called');
			}, null, null, done);
		});
	});
});
