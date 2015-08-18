'use strict';

var rewire = require('rewire');
var config = rewire('config');


suite('config', function () {

	var MINIMAL_CFG = {net: {gameServers: {gs01: {host: '127.0.0.1', ports: [1443]}}}};

	var cfgBackup;

	setup(function () {
		cfgBackup = config.get();
		config.reset();
	});

	teardown(function () {
		config.init(false, cfgBackup, {});
	});


	suite('init/initClusterConfig', function () {

		test('init does its job (master)', function () {
			config.init(true, MINIMAL_CFG, {net: {gameServers: {gs01: {
				addedProp: 'x',
			}}}});
			assert.strictEqual(config.get().net.gameServers.gs01.addedProp, 'x');
			assert.strictEqual(config.get().net.gameServers.gs01.host,
				'127.0.0.1', 'other original properties still there');
			assert.strictEqual(config.getGsid(), 'gs01', 'GSID for master');
			config.init(true, MINIMAL_CFG, {net: {gameServers: {gs01: {
				ports: [12345],
			}}}});
			assert.strictEqual(config.get().net.gameServers.gs01.ports[0],
				12345, 'replaced value');
		});

		test('init does its job (worker)', function () {
			process.env.gsid = 'gs01-01';
			config.init(false, MINIMAL_CFG, {});
			assert.strictEqual(config.getGsid(), 'gs01-01', 'GSID for worker');
			delete process.env.gsid;
		});

		test('insufficient net configuration causes ConfigError', function () {
			assert.throw(function () {
				config.init(true, {}, {});
			}, config.ConfigError);
		});

		test('cluster configuration is created correctly', function () {
			config.init(true, {
				net: {gameServers: {
					gs07: {host: '123.4.5.6', ports: [2345]},
					gs01: {host: '127.0.0.1', ports: [1234, 1235]},
				}},
			}, {});
			assert.deepEqual(config.__get__('gsids'),
				['gs01-01', 'gs01-02', 'gs07-01']);
			assert.deepEqual(config.__get__('gameServers'), {
				'gs01-01': {
					gsid: 'gs01-01',
					host: '127.0.0.1',
					port: 1234,
					hostPort: '127.0.0.1:1234',
					local: true,
				},
				'gs01-02': {
					gsid: 'gs01-02',
					host: '127.0.0.1',
					port: 1235,
					hostPort: '127.0.0.1:1235',
					local: true,
				},
				'gs07-01': {
					gsid: 'gs07-01',
					host: '123.4.5.6',
					port: 2345,
					hostPort: '123.4.5.6:2345',
					local: false,
				},
			});
		});
	});


	suite('setGsid', function () {

		test('cannot be called twice', function () {
			var setGsid = config.__get__('setGsid');
			setGsid('asdf');
			assert.strictEqual(config.getGsid(), 'asdf');
			assert.throw(function () {
				setGsid('boom');
			}, config.ConfigError);
			assert.strictEqual(config.getGsid(), 'asdf');
		});
	});


	suite('isLocal', function () {

		test('does its job', function () {
			var isLocal = config.__get__('isLocal');
			assert.isTrue(isLocal('127.0.0.1'));
			assert.isFalse(isLocal('123.456.789.0'));
		});
	});


	suite('get', function () {

		test('does its job', function () {
			config.init(true, MINIMAL_CFG, {test: {a: 'foo', b: {c: 'xyz'}}});
			assert.strictEqual(config.get().test.a, 'foo');
			assert.strictEqual(config.get('test:a'), 'foo');
			assert.strictEqual(config.get('test:b').c, 'xyz');
			assert.strictEqual(config.get('test:b:c'), 'xyz');
			assert.throw(function () {
				config.get('test:a:x');
			}, config.ConfigError);
		});
	});


	suite('forEachGS/forEachLocalGS/forEachRemoteGS', function () {

		var cfg = {
			net: {gameServers: {
				gs07: {host: '123.4.5.6', ports: [2345]},
				gs01: {host: '127.0.0.1', ports: [1234, 1235]},
			}},
		};

		test('do their job', function () {
			config.init(true, cfg, {});
			var visited = [];
			config.forEachGS(function (gsconf) {
				visited.push(gsconf.gsid);
			});
			assert.deepEqual(visited, ['gs01-01', 'gs01-02', 'gs07-01']);
			visited = [];
			config.forEachLocalGS(function (gsconf) {
				visited.push(gsconf.gsid);
				assert.include(['127.0.0.1:1234', '127.0.0.1:1235'], gsconf.hostPort);
			});
			assert.deepEqual(visited, ['gs01-01', 'gs01-02']);
			config.forEachRemoteGS(function (gsconf) {
				assert.strictEqual(gsconf.hostPort, '123.4.5.6:2345');
			});
		});

		test('returns collected return values', function (done) {
			config.init(true, cfg, {});
			config.forEachGS(
				function (gsconf, cb) {
					cb(null, gsconf.gsid.toUpperCase());
				},
				function callback(err, res) {
					assert.isNull(err);
					assert.deepEqual(res, {
						'gs01-01': 'GS01-01',
						'gs01-02': 'GS01-02',
						'gs07-01': 'GS07-01',
					});
					done();
				}
			);
		});

		test('aborts when an error occurs', function (done) {
			config.init(true, cfg, {});
			config.forEachGS(
				function (gsconf, cb) {
					if (gsconf.gsid === 'gs01-02') return cb(new Error('gargle'));
					cb();
				},
				function callback(err, res) {
					assert.instanceOf(err, Error);
					assert.strictEqual(err.message, 'gargle');
					assert.isUndefined(res);
					done();
				}
			);
		});
	});


	suite('mapToGS', function () {

		test('does its job', function () {
			config.init(true, {
				net: {gameServers: {
					gs1: {host: '127.0.0.1', ports: [1, 2]},
					gs2: {host: '5.6.7.8', ports: [3, 4]},
				}},
			}, {});
			var gsids = ['gs1-01', 'gs1-02', 'gs2-01', 'gs2-02'];
			['L1234', 'I56', 'PAO25K62', 'B2', 'DXYZ'].forEach(function (tsid) {
				assert.include(gsids, config.mapToGS(tsid).gsid);
			});
			[
				{tsid: 'LSDGSGVWT'},
				{tsid: 'I235252WB'},
				{tsid: 'BW1T1P15W13E5I3V46T3M75W7P37T34I3V64W34P2E23T2356I23T'},
			].forEach(function (obj) {
				assert.include(gsids, config.mapToGS(obj).gsid);
			});
		});
	});


	suite('getServicePort', function () {

		test('does its job', function () {
			config.init(true, {
				net: {gameServers: {
					gs1: {host: '127.0.0.1', ports: [1, 2]},
					gs2: {host: '5.6.7.8', ports: [3]},
					gs3: {host: '6.7.8.9', ports: [4]},
				}},
			}, {});
			assert.strictEqual(config.getServicePort(100, 'gs1-01'), 101);
			assert.strictEqual(config.getServicePort(100, 'gs1-02'), 102);
			assert.strictEqual(config.getServicePort(100, 'gs2-01'), 103);
			assert.strictEqual(config.getServicePort(100, 'gs3-01'), 104);
			// unknown GSID is assumed to be this host (ie. the cluster master in this case):
			assert.strictEqual(config.getServicePort(100, 'meh'), 100);
		});

		test('accepts a config path as basePort argument', function () {
			config.init(false, {
				net: {gameServers: {
					gs1: {host: '127.0.0.1', ports: [1, 2]},
				}},
				some: {base: {port: 777}},
			}, {gsid: 'gs1-02'});
			assert.strictEqual(config.getServicePort('some:base:port', 'gs1-01'), 778);
			assert.strictEqual(config.getServicePort('some:base:port'), 779);
		});
	});


	suite('getGSConf', function () {

		test('does its job (master)', function () {
			config.init(true, {net: {gameServers: {gs1: {host: '127.0.0.1',
				ports: [1]}}}}, {});
			assert.strictEqual(config.getGSConf(), undefined,
				'no GS config entry for master server');
		});

		test('does its job (worker)', function () {
			config.init(false, {
				net: {gameServers: {
					gs1: {host: '127.0.0.1', ports: [1]},
					gs2: {host: '5.6.7.8', ports: [2]},
				}},
			}, {gsid: 'gs1-01'});
			// not testing the format of the returned config object here, just
			// check the 'gsid' prop as proof that the right one was returned
			assert.strictEqual(config.getGSConf().gsid, 'gs1-01');
			assert.strictEqual(config.getGSConf('gs1-01').gsid, 'gs1-01');
			assert.strictEqual(config.getGSConf('gs2-01').gsid, 'gs2-01');
		});

		test('error for invalid GSID', function () {
			config.init(true, MINIMAL_CFG, {});
			assert.throw(function () {
				config.getGSConf('blurb');
			}, assert.AssertionError);
		});
	});


	suite('getMasterGsid', function () {

		test('works as expected (master)', function () {
			config.init(true, {
				net: {gameServers: {
					gs1: {host: '127.0.0.1', ports: [1, 2]},
				}},
			}, {});
			assert.strictEqual(config.getMasterGsid(), 'gs1');
		});

		test('works as expected (worker)', function () {
			config.init(false, {
				net: {gameServers: {
					gs1: {host: '127.0.0.1', ports: [1, 2]},
				}},
			}, {gsid: 'gs1-01'});
			assert.strictEqual(config.getMasterGsid(), 'gs1');
		});
	});
});
