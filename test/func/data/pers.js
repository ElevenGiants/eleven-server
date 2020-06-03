'use strict';

var _ = require('lodash');
var config = require('config');
var path = require('path');
var pers = require('data/pers');
var gsjsBridge = require('model/gsjsBridge');
var GameObject = require('model/GameObject');
var Player = require('model/Player');
var Item = require('model/Item');
var pbeMock = require('../../mock/pbe');
var RC = require('data/RequestContext');
var orProxy = require('data/objrefProxy');
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
			}},
		}}, done);
	});

	teardown(function () {
		pers.init();  // disable mock back-end
	});

	suite('game object loading', function () {

		test('loaded game objects are initialized correctly', function (done) {
			new RC().run(function () {
				var o = pers.get('IHFK8C8NB6J2FJ5');
				assert.instanceOf(o, Item);
				assert.instanceOf(o, GameObject);
				assert.strictEqual(o.constructor.name, o.class_tsid);
				assert.property(o, 'distributeQuoinShards', 'quoin-specific property');
				assert.property(o, 'distanceFromPlayer', 'property from item.js');
			}, done);
		});

		test('recursive structures (Player with inventory) are loaded correctly', function (done) {
			new RC().run(function () {
				var p = pers.get('P00000000000002');
				assert.instanceOf(p, Player);
				assert.deepEqual(Object.keys(p.items), ['I00000000000002']);
				assert.isTrue(p.items.I00000000000002.__isORP);
			}, done);
		});

		test('remote and local objects are loaded and proxified correctly in a cluster setup', function (done) {
			var cfgBackup = config.get();
			config.init(false, {net: {
				gameServers: {gs01: {host: '127.0.0.1', ports: [3000, 3001]}},
				rpc: {basePort: 17000},
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
			// avoid calling resumeGsTimers here as this is usually
			// not called after unloading a gameobject
			pbeMock.getDB().GO1 = {tsid: 'GO1', resumeGsTimers: _.noop};
			pbeMock.getDB().GO2 = {tsid: 'GO2', resumeGsTimers: _.noop};
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
				},
				true
			);
			setTimeout(function wait() {
				assert.isFalse(timerFired);
				done();
			}, 20);
		});

		test('does not load objects scheduled for unloading', function (done) {
			var p = orProxy.makeProxy({tsid: 'GNOTAVAILABLE', objref: true});
			var rc = new RC();
			rc.run(
				function () {
					rc.setUnload(p);
				},
				function cb(err, res) {
					if (err) return done(err);
					assert.strictEqual(pbeMock.getCounts().read, 0);
					return done();
				}
			);
		});

		test('does not load non-loaded objects referenced within objects scheduled for unloading', function (done) {
			var obj = {
				tsid: 'P1',
				items: {b1: {tsid: 'B1'}},
			};
			pbeMock.getDB().p1 = obj;
			obj.location = orProxy.makeProxy({tsid: 'L1', objref: true});
			obj.items.b1 = {tsid: 'B1', items: {}};
			obj.items.b1.items.i1 = orProxy.makeProxy({tsid: 'I1', objref: true});
			pbeMock.getDB().b1 = obj.items.b1;
			var rc = new RC();
			rc.run(
				function () {
					pers.get('P1');
					pers.get('B1');
					assert.strictEqual(pbeMock.getCounts().read, 2);
					rc.setUnload(obj);
				},
				function cb(err, res) {
					if (err) return done(err);
					assert.strictEqual(pbeMock.getCounts().read, 2);
					return done();
				}
			);
		});
	});


	suite('data integrity and consistency', function () {

		test('no duplicate objects with slow async back-end and fibers', function (done) {
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
			/* eslint-disable no-loop-func */  // oh well, it's just a test
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
			/* eslint-enable no-loop-func */
			// wait for all requests to finish and report first error (if any)
			setTimeout(function () {
				done(err);
			}, 100);
		});
	});


	suite('clearStaleRefs', function () {

		test('works with reference hashes as well as arrays', function (done) {
			pbeMock.getDB().L1 = {tsid: 'L1', label: 'dummyLoc'};
			pbeMock.getDB().G1 = {tsid: 'G1'};
			pbeMock.getDB().R2 = {tsid: 'R2', label: 'exists'};
			pbeMock.getDB().R3 = {tsid: 'R3', label: 'exists'};
			pbeMock.getDB().D1 = {
				owner: {objref: true, tsid: 'L1'},
				tsid: 'D1',
				instances: {
					hashes: {
						paradise_radial_heights: {objref: true, tsid: 'R1'},
						foo: {objref: true, tsid: 'R2'},
					},
					arrays: {
						room: [
							{objref: true, tsid: 'R3'},
							{objref: true, tsid: 'R4'},
						],
					},
				},
			};
			new RC().run(function () {
				var dc = pers.get('D1');
				pers.clearStaleRefs(dc, 'instances.hashes');
				pers.clearStaleRefs(dc, 'instances.arrays.room');
				assert.deepEqual(_.map(dc.instances.hashes, 'tsid'), ['R2']);
				assert.deepEqual(_.map(dc.instances.arrays.room, 'tsid'), ['R3']);
			}, done);
		});
	});
});
