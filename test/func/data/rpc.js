var rewire = require('rewire');
var config = rewire('config');
var rpc = rewire('data/rpc');


suite('rpc', function() {

	var CONFIG = {net: {
		gameServers: {
			gs01: {host: '127.0.0.1', ports: [3000, 3001]},
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
		config.init(true, cfgBackup);
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
			// set up client/server loopback connection within the same process
			config.init(true, CONFIG, {});
			rpc.__get__('initServer')(function serverStarted() {
				rpc.__get__('initClient')(GSCONF_LOOPBACK, function clientStarted() {
					done();
				});
			});
		});

		teardown(function(done) {
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
	});
});
