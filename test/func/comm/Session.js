'use strict';

var async = require('async');
var auth = require('comm/auth');
var abePassthrough = require('comm/abe/passthrough');
var net = require('net');
var path = require('path');
var config = require('config');
var RC = require('data/RequestContext');
var Session = require('comm/Session');
var sessionMgr = require('comm/sessionMgr');
var pers = require('data/pers');
var pbeMock = require('../../mock/pbe');
var gsjsBridge = require('model/gsjsBridge');
var helpers = require('../../helpers');


suite('Session', function () {

	var server;
	var cfg = config.getGSConf('gs01-01');

	suiteSetup(function () {
		sessionMgr.init();
		server = net.createServer(function (socket) {
			var s = sessionMgr.newSession(socket);
			s.processRequest = function (req) {
				socket.write(JSON.stringify(req));  // echo request object
			};
		}).listen(cfg.port, cfg.host);
	});

	suiteTeardown(function () {
		server.close();
		sessionMgr.init();
	});


	suite('connection and data transmission', function () {

		this.timeout(5000);
		this.slow(2000);

		test('works as expected over local TCP connection', function (done) {
			var sock = net.connect(cfg.port, cfg.host);
			sock.on('data', function (data) {
				assert.deepEqual(JSON.parse(data.toString()), {type: 'foo'});
				sock.end();
			});
			sock.on('close', function () {
				assert.strictEqual(sessionMgr.getSessionCount(), 0);
				done();
			});
			sock.write(helpers.amfEnc({type: 'foo'}));
		});

		test('works with a number of concurrent connections', function (done) {
			var numbers = Array.apply(null, {length: 100}).map(Number.call, Number);
			async.eachLimit(numbers, 10,
				function iterator(i, cb) {
					net.connect(cfg.port, cfg.host)
						.on('data', function (data) {
							assert.deepEqual(JSON.parse(data.toString()), {msg_id: i});
							this.end();
						})
						.on('close', function (hadError) {
							cb(hadError);
						})
						.write(helpers.amfEnc({msg_id: i}));
				},
				function callback(err) {
					assert.strictEqual(sessionMgr.getSessionCount(), 0);
					done(err);
				}
			);
		});
	});


	suite('special request processing', function () {

		this.timeout(10000);
		this.slow(2000);

		suiteSetup(function () {
			// initialize gsjsBridge data structures (empty) without loading all the prototypes
			gsjsBridge.init(true);
			auth.init(abePassthrough);
		});

		suiteTeardown(function () {
			// reset gsjsBridge so the cached prototypes don't influence other tests
			gsjsBridge.reset();
			auth.init(null);
		});

		setup(function (done) {
			pers.init(pbeMock, {backEnd: {
				module: 'pbeMock',
				config: {pbeMock: {
					fixturesPath: path.resolve(path.join(__dirname, '../fixtures')),
				}}
			}}, done);
		});

		teardown(function () {
			pers.init();  // disable mock back-end
		});

		test('login_start', function (done) {
			var onLoginCalled = false;
			var s = new Session('TEST', helpers.getDummySocket());
			s.gsjsProcessMessage = function (pc, req) {
				assert.strictEqual(pc.tsid, 'P00000000000001');
				assert.strictEqual(req.type, 'login_start');
				assert.isTrue(onLoginCalled);
				done();
			};
			var rc = new RC('login_start TEST', undefined, s);
			rc.run(function () {
				var p = pers.get('P00000000000001');
				p.onLogin = function () {
					onLoginCalled = true;
				};
				s.processRequest({
					msg_id: '1',
					type: 'login_start',
					token: 'P00000000000001',
				});
			});
		});

		test('login_end', function () {
			var onPlayerEnterCalled = false;
			var s = new Session('TEST', helpers.getDummySocket());
			s.gsjsProcessMessage = function dummy() {};  // just a placeholder to prevent calling the "real" function
			var rc = new RC('login_end TEST', undefined, s);
			rc.run(function () {
				var l = pers.get('LLI32G3NUTD100I');
				l.onPlayerEnter = function () {
					onPlayerEnterCalled = true;
				};
				var p = pers.get('P00000000000001');
				s.pc = p;  // login_start must have already happened
				assert.deepEqual(l.players, {});
				s.processRequest({
					msg_id: '2',
					type: 'login_end',
				});
				assert.deepEqual(Object.keys(l.players), ['P00000000000001']);
				assert.isTrue(onPlayerEnterCalled);
			});
		});
	});


	suite('error handling', function () {

		test('unhandled errors during request processing are caught by domain',
			function (done) {
			var s = new Session('TEST', helpers.getDummySocket());
			var thrown = false;
			s.processRequest = function processRequest(req) {
				RC.getContext().setPostPersCallback(function cb() {
					thrown = true;
					throw new Error('unhandled error in RC.run');
				});
			};
			// hack to prevent mocha from catching the error, so the domain has
			// a chance to handle it
			// see https://github.com/mochajs/mocha/issues/513#issuecomment-26963630
			process.nextTick(function () {
				s.handleMessage({});
			});
			setImmediate(function () {
				assert.isTrue(thrown);
				// nothing else to assert - we're just testing that the error
				// does not bubble up to the surface
				done();
			});
		});
	});
});
