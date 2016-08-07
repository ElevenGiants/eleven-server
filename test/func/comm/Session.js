'use strict';

var async = require('async');
var auth = require('comm/auth');
var abePassthrough = require('comm/abe/passthrough');
var net = require('net');
var path = require('path');
var wait = require('wait.for');
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
							assert.strictEqual(JSON.parse(data.toString()).msg_id, i);
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
				}},
			}}, done);
		});

		teardown(function () {
			pers.init();  // disable mock back-end
		});

		test('login_start', function (done) {
			var s = new Session('TEST', helpers.getDummySocket());
			s.gsjsProcessMessage = function (pc, req) {
				assert.strictEqual(pc.tsid, 'P00000000000001');
				assert.strictEqual(req.type, 'login_start');
				assert.strictEqual(pc.session, s);
				done();
			};
			var rc = new RC('login_start TEST', undefined, s);
			rc.run(function () {
				s.processRequest({
					msg_id: '1',
					type: 'login_start',
					token: 'P00000000000001',
				});
			});
		});

		test('login_end', function (done) {
			var onPlayerEnterCalled = false;
			var s = new Session('TEST', helpers.getDummySocket());
			s.gsjsProcessMessage = function (pc, req) {
				assert.isFalse(onPlayerEnterCalled);
			};
			var rc = new RC('login_end TEST', undefined, s);
			rc.run(function () {
				var l = pers.get('LLI32G3NUTD100I');
				l.onPlayerEnter = function () {
					onPlayerEnterCalled = true;
					return done();
				};
				var p = pers.get('P00000000000001');
				s.pc = p;  // login_start must have already happened
				assert.deepEqual(l.players, {});
				s.processRequest({
					msg_id: '2',
					type: 'login_end',
				});
				assert.deepEqual(Object.keys(l.players), ['P00000000000001']);
				assert.isFalse(onPlayerEnterCalled);
			});
		});
	});


	suite('FIFO request processing', function () {

		this.timeout(2000);
		this.slow(1000);

		test('processes regular requests in FIFO order', function (done) {
			var s = helpers.getTestSession();
			var fastDone = false;
			var slowDone = false;
			s.processRequest = function processRequest(req) {
				if (req.type === 'fast') {
					fastDone = true;
					assert.isTrue(slowDone);
					done();
				}
				if (req.type === 'slow') {
					// simulate a "slow" GSJS request that yields its fiber
					wait.for(function (cb) {
						setTimeout(function () {
							slowDone = true;
							assert.isFalse(fastDone);
							cb();
						}, 100);
					});
				}
			};
			s.enqueueMessage({type: 'slow'});
			s.enqueueMessage({type: 'fast'});
		});
	});
});
