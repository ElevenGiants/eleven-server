'use strict';

var config = require('config');
var path = require('path');
var pers = require('data/pers');
var gsjsBridge = require('model/gsjsBridge');
var GameObject = require('model/GameObject');
var Player = require('model/Player');
var Item = require('model/Item');
var pbeMock = require('../../mock/pbe');
var RC = require('data/RequestContext');
var orproxy = require('data/objrefProxy');
var wait = require('wait.for');


suite('pers', function () {

	this.timeout(5000);
	this.slow(1000);

	suiteSetup(function () {
		// initialize gsjsBridge data structures (empty) without loading all the prototypes
		gsjsBridge.reset();
	});

	suiteTeardown(function () {
		// reset gsjsBridge so the cached prototypes don't influence other tests
		gsjsBridge.reset();
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

	suite('game object loading', function () {

		test('loaded game objects are initialized correctly', function (done) {
			new RC().run(function () {
				var o = pers.get('IHFK8C8NB6J2FJ5');
				assert.instanceOf(o.__proxyTarget, Item);
				assert.instanceOf(o.__proxyTarget, GameObject);
				assert.strictEqual(o.constructor.name, o.class_tsid);
				assert.property(o, 'distributeQuoinShards', 'quoin-specific property');
				assert.property(o, 'distanceFromPlayer', 'property from item.js');
			}, done);
		});

		test('recursive structures (Player with inventory) are loaded correctly',
			function (done) {
			new RC().run(function () {
				var p = pers.get('P00000000000002');
				assert.instanceOf(p.__proxyTarget, Player);
				assert.deepEqual(Object.keys(p.items), ['I00000000000002']);
				assert.isTrue(p.items.I00000000000002.__isORP);
			}, done);
		});

		test('remote and local objects are loaded and proxified correctly in' +
			 ' a cluster setup', function (done) {
			var cfgBackup = config.get();
			config.init(false, {net: {gameServers: {
					gs01: {host: '127.0.0.1', ports: [3000, 3001]},
				}, rpc: {basePort: 17000},
			}}, {gsid: 'gs01-01'});
			// this is dependent on the specific implementation of the TSID ->
			// server mapping, and will have to be adjusted when that changes
			pbeMock.getDB().R1 = {tsid: 'R1'};
			pbeMock.getDB().R2 = {tsid: 'R2'};
			new RC().run(function () {
				var group1 = pers.get('R1');
				assert.isTrue(group1.__isRP);
				var group2 = pers.get('R2');
				assert.notProperty(group2, '__isRP');
				config.init(false, cfgBackup, {});  // restore default test config
			}, done);
		});
	});


	suite('postRequestProc', function () {

		test('suspends timers when deleting/unloading', function (done) {
			pbeMock.getDB().GO1 = {tsid: 'GO1'};
			pbeMock.getDB().GO2 = {tsid: 'GO2'};
			var go1, go2;
			var timerFired = false;
			var rc = new RC();
			var gsTimers = {};
			rc.run(
				function () {
					go1 = pers.get('GO1');
					go2 = pers.get('GO2');
					go1.foo = go2.foo = function foo() {
						timerFired = true;
					};
					// cache reference because go1/go2 (which are actually proxy
					// wrappers) will be unavailable after deletion/unloading
					gsTimers.go1 = go1.gsTimers;
					gsTimers.go2 = go2.gsTimers;
					go1.del();
					rc.setUnload(go2);
					go1.setGsTimer({fname: 'foo', delay: 5});
					go2.setGsTimer({fname: 'foo', delay: 10, interval: true});
				},
				function cb(err, res) {
					if (err) done(err);
					assert.notProperty(gsTimers.go1.foo, 'handle');
					assert.notProperty(gsTimers.go2.foo, 'handle');
				}
			);
			setTimeout(function wait() {
				assert.isFalse(timerFired);
				done();
			}, 20);
		});

		test('does not load objects scheduled for unloading', function (done) {
			var p = orproxy.makeProxy({tsid: 'GNOTAVAILABLE', objref: true});
			var rc = new RC();
			rc.run(
				function () {
					rc.setUnload(p);
				},
				function cb(err, res) {
					if (err) done(err);
					assert.strictEqual(pbeMock.getCounts().read, 0);
					done();
				}
			);
		});
	});


	suite('data integrity and consistency', function () {

		test('no duplicate objects with slow async back-end and fibers',
			function (done) {
			// set up "slow" fibers based back-end mock
			pers.init({
				read: function read(tsid) {
					return wait.for(function (callback) {
						setTimeout(function () {
							callback(null, {tsid: tsid});
						}, 10);
					});
				},
			}, {});
			// launch some quasi-parallel requests that all load the same object
			var firstLoaded;
			var err;
			/*jshint -W083 */  // oh well, it's just a test
			for (var i = 0; i < 10; i++) {
				setImmediate(function launchReq() {
					new RC().run(function () {
						var o = pers.get('GXYZ', true);
						if (!firstLoaded) firstLoaded = o;
						assert.strictEqual(o, firstLoaded, 'subsequent get ' +
							'calls return reference to the first and only ' +
							'instance of that object');
					},
					function cb(e, res) {
						// store first error (and repackage it, so mocha
						// doesn't fall over the nonexistent RC later)
						if (e && !err) err = new Error(e);
					});
				});
			}
			/*jshint +W083 */
			// wait for all requests to finish and report first error (if any)
			setTimeout(function () {
				done(err);
			}, 100);
		});
	});
});
