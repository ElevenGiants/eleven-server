'use strict';

var async = require('async');
var rewire = require('rewire');
var auth = require('comm/auth');
var abePassthrough = require('comm/abe/passthrough');
var Property = require('model/Property');
var Player = rewire('model/Player');
var Location = require('model/Location');
var Geo = require('model/Geo');
var Item = require('model/Item');
var RC = rewire('data/RequestContext');
var RQ = require('data/RequestQueue');
var rpcMock = require('../../mock/rpc');
var persMock = require('../../mock/pers');


suite('Player', function () {

	setup(function () {
		RC.__set__('pers', persMock);
		persMock.reset();
		RQ.init();
	});

	teardown(function () {
		RC.__set__('pers', rewire('data/pers'));
		persMock.reset();
		RQ.init();
	});


	function getCDTestPlayer() {
		// creates a dummy player for collision detection tests
		var p = new Player({tsid: 'P', x: 0, y: 0, h: 100, w: 50});
		p.stacked_physics_cache = {pc_scale: 1};
		p.location = new Location({tsid: 'L'}, new Geo());
		p.active = true;
		return p;
	}


	suite('ctor', function () {

		test('TSIDs of new Player objects start with P', function () {
			assert.strictEqual(new Player().tsid[0], 'P');
		});

		test('properties are initialized properly', function () {
			var p = new Player({tsid: 'P1', metabolics: {energy: 7000}});
			assert.instanceOf(p.metabolics.energy, Property);
			assert.strictEqual(p.metabolics.energy.value, 7000);
			p = new Player({tsid: 'P1',
				metabolics: {
					energy: {value: 50, bottom: 0, top: 800, label: 'energy'},
				},
				stats: {
					recipe_xp_today: {
						97: {value: 2, bottom: 0, top: 85447, label: '97'}
					},
				},
			});
			assert.instanceOf(p.metabolics.energy, Property);
			assert.strictEqual(p.metabolics.energy.value, 50);
			assert.strictEqual(p.metabolics.energy.bottom, 0);
			assert.strictEqual(p.metabolics.energy.top, 800);
			assert.deepEqual(Object.keys(p.stats.recipe_xp_today), ['97']);
			assert.instanceOf(p.stats.recipe_xp_today['97'], Property);
			assert.strictEqual(p.stats.recipe_xp_today['97'].value, 2);
			assert.strictEqual(p.stats.recipe_xp_today['97'].top, 85447);
		});

		test('missing properties are created', function () {
			var p = new Player();
			assert.strictEqual(p.metabolics.energy.value, 0);
			assert.strictEqual(p.stats.xp.value, 0);
			assert.strictEqual(p.daily_favor.ti.value, 0);
		});
	});


	suite('serialize', function () {

		test('properties are serialized correctly', function () {
			var p = new Player({tsid: 'P1', stats: {xp: 23}});
			var data = p.serialize();
			assert.deepEqual(data.stats.xp,
				{value: 23, bottom: 23, top: 23});
		});

		test('does not add properties that are not there yet already', function () {
			var p = new Player({tsid: 'P1'});
			p.stats = {xp: new Property('xp', 1)};
			p.metabolics = {energy: new Property('energy', 2)};
			var data = p.serialize();
			assert.sameMembers(Object.keys(data.stats), ['xp']);
			assert.sameMembers(Object.keys(data.metabolics), ['energy']);
		});

		test('stores non-property members too', function () {
			var p = new Player({tsid: 'P1', stats: {blerg: 12}});
			var data = p.serialize();
			assert.strictEqual(data.stats.blerg, 12);
		});

		test('stores data in a way that allows restoring properties correctly',
			function () {
			var p = new Player({tsid: 'P1',
				daily_favor: {alph: {value: 17, bottom: 2, top: 20}}});
			p = new Player(p.serialize());
			assert.strictEqual(p.daily_favor.alph.bottom, 2);
			assert.strictEqual(p.daily_favor.alph.top, 20);
			assert.strictEqual(p.daily_favor.alph.value, 17);
			assert.strictEqual(p.daily_favor.alph.label, 'alph');
		});

		test('serializes an object containing properties', function () {
			var p = new Player({
				tsid: 'P1',
				stats: {
					recipe_xp_today: {
						14: new Property('14', 10),
						20: new Property('20', 100)
					}
				}
			});
			var data = p.serialize();
			var keys = Object.keys(data.stats.recipe_xp_today);
			assert.sameMembers(keys, ['14', '20']);
		});
	});


	suite('startMove', function () {

		test('removes player from old loc and updates location property',
			function () {
			var lold = new Location({tsid: 'Lold'}, new Geo());
			var lnew = new Location({tsid: 'Lnew'}, new Geo());
			var p = new Player({tsid: 'P1', location: lold, x: 1, y: 1});
			p.active = true;
			lold.players[p.tsid] = p;
			p.startMove(lnew, 2, 3);
			assert.strictEqual(p.location, lnew);
			assert.strictEqual(p.x, 2);
			assert.strictEqual(p.y, 3);
			assert.lengthOf(Object.keys(lold.players), 0);
			assert.deepEqual(lnew.players, {},
				'player is not added to new loc yet');
		});

		test('works when player does not have a current location', function () {
			var p = new Player({tsid: 'P1'});
			var l = new Location({tsid: 'L'}, new Geo());
			p.startMove(l, 0, 0);
			assert.strictEqual(p.location, l);
			assert.deepEqual(l.players, {},
				'player is not added to new loc yet');
		});

		test('calls onExit callbacks', function (done) {
			var itemOnPlayerExitCalled = false;
			var locOnPlayerExitCalled = false;
			var i = new Item({tsid: 'I'});
			var lold = new Location({tsid: 'Lold', items: [i]}, new Geo());
			var lnew = new Location({tsid: 'Lnew'}, new Geo());
			var p = new Player({tsid: 'P1', location: lold});
			i.onPlayerExit = function (player) {
				itemOnPlayerExitCalled = true;
				assert.strictEqual(player, p);
				if (locOnPlayerExitCalled) return done();
			};
			lold.onPlayerExit = function (player, newLoc) {
				locOnPlayerExitCalled = true;
				assert.strictEqual(player, p);
				assert.strictEqual(newLoc, lnew);
				if (itemOnPlayerExitCalled) return done();
			};
			p.startMove(lnew, 0, 0);
		});

		test('does not change current location for logout call', function () {
			var p = new Player({tsid: 'P1', x: 3, y: 7});
			var l = new Location({tsid: 'L', players: [p]}, new Geo());
			p.location = l;
			p.startMove();
			assert.deepEqual(l.players, {},
				'player removed from location on logout');
			assert.strictEqual(p.location, l,
				'location property unchanged after logout');
			assert.strictEqual(p.x, 3);
		});
	});


	suite('endMove', function () {

		test('adds player to player list in new loc', function () {
			var l = new Location({tsid: 'L'}, new Geo());
			var p = new Player({tsid: 'P1', location: l});
			p.endMove();
			assert.strictEqual(p.location, l);  // unchanged
			assert.deepEqual(l.players, {P1: p}, 'player added to new loc');
		});
	});


	suite('onDisconnect', function () {

		setup(function () {
			Player.__set__('rpc', rpcMock);
			rpcMock.reset(true);
		});

		teardown(function () {
			Player.__set__('rpc', require('data/rpc'));
		});

		test('handles logout/error case correctly', function (done) {
			var logoutCalled = false;
			var p = new Player({tsid: 'P1', session: 'foo'});
			p.onLogout = function () {
				logoutCalled = true;
			};
			// make sure the player is eventually unloaded (separate request)
			p.unload = function () {
				assert.isTrue(logoutCalled, 'API event onLogout called');
				done();
			};
			var l = new Location({tsid: 'L', players: [p]}, new Geo());
			p.location = l;
			rpcMock.reset(true);  // simulate logout/connection error
			new RC().run(
				function () {
					p.onDisconnect();
				},
				function callback(err, res) {
					if (err) return done(err);
					assert.isFalse('P1' in l.players,
						'PC removed from location');
					assert.isNull(p.session);
				}
			);
		});

		test('handles inter-GS move case correctly', function (done) {
			var logoutCalled = false;
			var p = new Player({tsid: 'P1', session: 'foo'});
			p.onLogout = function () {
				logoutCalled = true;
			};
			var l = new Location({tsid: 'L', players: [p]}, new Geo());
			p.location = l;
			rpcMock.reset(false);  // simulate inter-GS move
			new RC().run(
				function () {
					p.onDisconnect();
				},
				function callback(err, res) {
					if (err) return done(err);
					assert.isTrue('P1' in l.players,
						'PC not removed from loc (already the new location)');
					assert.isFalse(logoutCalled,
						'API event onLogout is not called on loc change');
					assert.isNull(p.session);
					done();
				}
			);
		});
	});


	suite('sendServerMsg', function () {

		test('does what it is supposed to do', function (done) {
			var p = new Player({tsid: 'P1'});
			p.session = {
				send: function send(msg) {
					assert.deepEqual(msg, {
						type: 'server_message',
						action: 'CLOSE',
						ping: 'pong',
					});
					done();
				},
			};
			p.sendServerMsg('CLOSE', {ping: 'pong'});
		});

		test('works without optional data parameter', function (done) {
			var p = new Player({tsid: 'P1'});
			p.session = {
				send: function send(msg) {
					assert.deepEqual(msg, {
						type: 'server_message',
						action: 'TOKEN',
					});
					done();
				},
			};
			p.sendServerMsg('TOKEN');
		});

		test('error for offline player', function () {
			assert.throw(function () {
				new Player().sendServerMsg('FOO');
			}, assert.AssertionError);
		});
	});


	suite('gsMoveCheck', function () {

		setup(function () {
			Player.__set__('config', {
				getGSConf: function getGSConf(gsid) {
					return {
						gsid: 'gs02-03',
						host: '12.34.56.78',
						port: 1445,
						hostPort: '12.34.56.78:1445',
						local: false,
					};
				},
			});
			Player.__set__('rpc', rpcMock);
			rpcMock.reset(true);
			auth.init(abePassthrough);
		});

		teardown(function () {
			Player.__set__('config', require('config'));
			Player.__set__('rpc', require('data/rpc'));
			rpcMock.reset(true);
			auth.init(null);
		});

		test('handles local move case correctly', function (done) {
			var p = new Player({tsid: 'P1', onGSLogout: function dummy() {}});
			var rc = new RC();
			rc.run(function () {
				var res = p.gsMoveCheck('LLOCAL');
				assert.isUndefined(res);
				done();
			});
		});

		test('returns data required for GS reconnect', function (done) {
			rpcMock.reset(false);
			var p = new Player({tsid: 'P1', onGSLogout: function dummy() {}});
			p.session = {send: function dummy() {}};
			new RC().run(function () {
				var res = p.gsMoveCheck('LREMOTE');
				assert.strictEqual(res.hostPort, '12.34.56.78:1445');
				assert.strictEqual(res.token, 'P1');
				done();
			});
		});

		test('sends/schedules server messages required for GS reconnect and ' +
			'unloads player', function (done) {
			rpcMock.reset(false);
			var p = new Player({tsid: 'P1', onGSLogout: function dummy() {}});
			var unloaded = false;
			p.unload = function () {
				unloaded = true;
			};
			var msgs = [];
			p.session = {send: function send(msg) {
				switch (msgs.length) {
					case 0:
						assert.deepEqual(msg, {
							type: 'server_message',
							action: 'PREPARE_TO_RECONNECT',
							hostport: '12.34.56.78:1445',
							token: 'P1',
						});
						break;
					case 1:
						assert.isTrue(unloaded);
						assert.deepEqual(msg, {
							type: 'server_message',
							action: 'CLOSE',
							msg: 'CONNECT_TO_ANOTHER_SERVER',
						});
						break;
					default:
						throw new Error('unexpected message: ' + JSON.stringify(msg));
				}
				msgs.push(msg);
				if (msgs.length > 1) return done();
			}};
			new RC().run(function () {
				p.gsMoveCheck('LREMOTE');
			});
		});
	});


	suite('mergeChanges', function () {

		test('combines queued changes', function () {
			var p = new Player();
			p.location = {tsid: 'L1Q8BNQAR14BZ7T3O8C'};
			p.changes = [
				{
					location_tsid: 'L1Q8BNQAR14BZ7T3O8C',
					itemstack_values: {
						pc: {},
						location: {
							I1Q8BNQAR14BZA22MG4: {
								x: 3, y: 0, slot: 3, count: 1,
								path_tsid: 'B1Q8BNQAR14BZA0ABK0/I1Q8BNQAR14BZA22MG4',
								class_tsid: 'pi',
								label: 'Pi',
							}}}},
				{
					location_tsid: 'L1Q8BNQAR14BZ7T3O8C',
					itemstack_values: {
						pc: {
							I1Q8BNQAR14BZA22MG4: {
								x: 3, y: 0, slot: 3, count: 0,
								path_tsid: 'B1Q8BNQAR14BZA0ABK0/I1Q8BNQAR14BZA22MG4',
								class_tsid: 'pi',
								label: 'Pi',
							}},
						location: {},
					},
				},
			];
			assert.deepEqual(p.mergeChanges(), {
				location_tsid: 'L1Q8BNQAR14BZ7T3O8C',
				itemstack_values: {
					pc: {
						I1Q8BNQAR14BZA22MG4: {
							x: 3, y: 0, slot: 3, count: 0,
							path_tsid: 'B1Q8BNQAR14BZA0ABK0/I1Q8BNQAR14BZA22MG4',
							class_tsid: 'pi',
							label: 'Pi',
						}},
					location: {
						I1Q8BNQAR14BZA22MG4: {
							x: 3, y: 0, slot: 3, count: 1,
							path_tsid: 'B1Q8BNQAR14BZA0ABK0/I1Q8BNQAR14BZA22MG4',
							class_tsid: 'pi',
							label: 'Pi',
						}}},
			});
		});

		test('works when no changes are queued', function () {
			var p = new Player();
			assert.isUndefined(p.mergeChanges());
		});

		test('skips irrelevant location item changes', function () {
			var p = new Player();
			p.location = {tsid: 'LPANAMA'};
			p.changes = [
				{
					location_tsid: 'LPANAMA',
					itemstack_values: {
						pc: {},
						location: {
							IX: {path_tsid: 'IX'},
						}}
				}, {
					location_tsid: 'LCANADA',
					itemstack_values: {
						pc: {
							IZ: {path_tsid: 'IZ'},
						},
						location: {
							IY: {path_tsid: 'IY'},
						}},
				},
			];
			assert.deepEqual(p.mergeChanges(), {
				location_tsid: 'LPANAMA',
				itemstack_values: {
					pc: {
						// location_tsid not relevant for changes in inventory, so this is kept
						IZ: {path_tsid: 'IZ'},
					},
					location: {
						IX: {path_tsid: 'IX'},
					},
				},
			});
		});

		test('picks last change if multiple changes for the same item are queued',
			function () {
			var p = new Player();
			p.location = {tsid: 'L1'};
			p.changes = [
				{
					location_tsid: 'L1',
					itemstack_values: {location: {
						IX: {path_tsid: 'IX', count: 2},
					}},
				}, {
					location_tsid: 'L1',
					itemstack_values: {location: {
						IX: {path_tsid: 'IX', count: 3},
					}},
				},
			];
			assert.deepEqual(p.mergeChanges(), {
				location_tsid: 'L1',
				itemstack_values: {
					pc: {},
					location: {
						IX: {path_tsid: 'IX', count: 3},
					}},
			});
		});
	});


	suite('getPropChanges', function () {

		test('works as expected', function () {
			var p = new Player();
			p.metabolics.energy.setLimits(0, 100);
			p.metabolics.energy.inc(60);
			p.stats.xp.setLimits(0, 1000);
			p.stats.xp.setVal(555);
			p.daily_favor.ti.setLimits(0, 100);
			p.daily_favor.ti.inc(12);
			assert.deepEqual(p.getPropChanges(), {
				energy: 60, xp: 555, ti: 12,
			});
			assert.isFalse(p.metabolics.energy.changed);
			assert.isFalse(p.stats.xp.changed);
			assert.isFalse(p.daily_favor.ti.changed);
		});

		test('ignores changed props for which no changes should be sent', function () {
			var p = new Player();
			p.metabolics.energy.setLimits(0, 100);
			p.metabolics.energy.inc(60);
			p.stats.donation_xp_today.setLimits(0, 10);
			p.stats.donation_xp_today.setVal(1);
			assert.isTrue(p.stats.donation_xp_today.changed);
			assert.deepEqual(p.getPropChanges(), {energy: 60});
		});

		test('returns undefined when nothing changed', function () {
			assert.isUndefined(new Player().getPropChanges());
		});
	});


	suite('isHit', function () {

		test('works as expected', function () {
			var p = getCDTestPlayer();
			var i = new Item({x: 23, y: 23, hitBox: {w: 100, h: 100}});
			var hit = p.isHit(i, i.hitBox);
			assert.isTrue(hit, 'it is hit');

			i = new Item({x: 2323, y: 2323, hitBox: {w: 100, h: 100}});
			hit = p.isHit(i, i.hitBox);
			assert.isFalse(hit, 'it is not hit, too far away');
		});

		test('respects scaled player size', function () {
			var p = getCDTestPlayer();
			var i = new Item({x: 200, y: 0, hitBox: {w: 100, h: 100}});
			var hit = p.isHit(i, i.hitBox);
			assert.isFalse(hit, 'it is not hit, player too small');

			p.stacked_physics_cache.pc_scale = 10;
			hit = p.isHit(i, i.hitBox);
			assert.isTrue(hit, 'it is hit, respected pc_scale');
		});
	});


	suite('setXY', function () {

		test('moves the player', function () {
			var p = getCDTestPlayer();
			var result = p.setXY(23, 23);
			assert.strictEqual(p.x, 23, 'correct x position');
			assert.strictEqual(p.y, 23, 'correct y position');
			assert.isTrue(result, 'returned true as player was moved');

			result = p.setXY(23, 23);
			assert.isFalse(result, 'returned false as player was not moved');
		});

		test('calls collision detection handling', function () {
			var p = getCDTestPlayer();
			var collDetDefaultHitBox = false;
			var collDetNamedHitBox = false;
			p.handleCollision = function (item, hitBox, hitBoxName) {
				collDetDefaultHitBox = true;
				if (hitBoxName) {
					collDetNamedHitBox = true;
				}
			};
			var i = new Item({tsid: 'I', x: 1000, y: 0, hitBox: {w: 100, h: 100}});
			p.location.items = [i];

			p.setXY(5, 5);
			assert.isFalse(collDetDefaultHitBox, 'still false, no collDet');

			i.collDet = true;
			p.setXY(10, 10);
			assert.isTrue(collDetDefaultHitBox, 'handleCollision with default hitBox');

			collDetDefaultHitBox = false;
			p.setXY(11, 11, true);
			assert.isFalse(collDetDefaultHitBox, 'CD skipped explicitly');

			i.hitBoxes = {foo: {w: 100, h: 100}};
			p.setXY(15, 15);
			assert.isTrue(collDetNamedHitBox, 'handleCollision with named hitBox');

			p.location.geometry.layers.middleground.boxes = [{w: 100, h: 100}];
			p.location.items = [];
			collDetDefaultHitBox = false;
			p.setXY(20, 20);
			assert.isTrue(collDetDefaultHitBox, 'handleCollision with geo hitBox');
		});

		test('does not set position while player is changing location', function () {
			var p = getCDTestPlayer();
			p.active = false;  // simulate location move in progress
			p.setXY(2, 3);
			assert.strictEqual(p.x, 0, 'setXY did not change player x');
			assert.strictEqual(p.y, 0, 'setXY did not change player y');
		});

		test('does not set position/handle collisions while player is changing location',
			function () {
			// i2 triggers a (fake) location change, no further item should be
			// collision-tested after that; due to the non-deterministic order
			// in which items are tested, the test may not always actually
			// verify this, but we can at least avoid false negatives
			var p = getCDTestPlayer();
			var i2collided = false;
			var i1 = new Item({tsid: 'I1', x: 0, y: 0, hitBox: {w: 100, h: 100},
				onPlayerCollision: function onPlayerCollision() {
					if (i2collided) {  // guard against unexpected CD check order
						throw new Error('should not be called');
					}
				},
			});
			var i2 = new Item({tsid: 'I2', x: 0, y: 0, hitBox: {w: 100, h: 100},
				onPlayerCollision: function onPlayerCollision() {
					i2collided = true;
					// simulate start of location move
					p.location = new Location({tsid: 'L2'}, new Geo());
					p.active = false;
				},
			});
			var i3 = new Item({tsid: 'I3', x: 0, y: 0, hitBox: {w: 100, h: 100},
				onPlayerCollision: i1.onPlayerCollision});
			p.location.items = {I1: i1, I2: i2, I3: i3};
			p.setXY(2, 3);
		});
	});


	suite('handleCollision', function () {

		test('works as expected when entering a hitbox', function (done) {
			var p = getCDTestPlayer();
			p['!colliders'] = {};
			var i = new Item({tsid: 'I', x: 0, y: 0, hitBox: {w: 100, h: 100}});
			i['!colliders'] = {};
			async.series([
				function callsHitBox(cb) {
					p.location.hitBox = function (hitBoxName, hit) {
						assert.property(p['!colliders'], 'undefined',
							'kept track of hitBox');
						return cb();
					};
					p.handleCollision(i, i.hitBox);
				},
				function callsOnPlayerCollision(cb) {
					i.onPlayerCollision = function (hitBoxName) {
						return cb();
					};
					p.handleCollision(i, i.hitBox, 'foo');
				},
				function callsOnPlayerCollisionDefaultHitbox(cb) {
					i.onPlayerCollision = function (hitBoxName) {
						assert.property(i['!colliders'], p.tsid,
							'kept track of player in hitBox');
						return cb();
					};
					p.handleCollision(i, i.hitBox);
				},
			], done);
		});

		test('works as expected when leaving a hitbox', function (done) {
			var p = getCDTestPlayer();
			p['!colliders'] = {foo: 1};
			var i = new Item({tsid: 'I', x: 1000, y: 0, hitBox: {w: 100, h: 100}});
			async.series([
				function callsOnLeavingHitBox(cb) {
					p.location.onLeavingHitBox = function (player, hitBoxName) {
						assert.notProperty(p['!colliders'], 'foo',
							'removed hitBox from !colliders');
						return cb();
					};
					p.handleCollision(i, i.hitBox, 'foo');
				},
				function callsOnPlayerLeavingCollisionArea(cb) {
					i.onPlayerCollision = function () {};  // needed to enable CD
					i.onPlayerLeavingCollisionArea = function (i) {
						assert.notProperty(i['!colliders'], p.tsid,
							'removed hitBox from !colliders');
						return cb();
					};
					i['!colliders'] = {P: 1};
					p.handleCollision(i, i.hitBox);
				},
			], done);
		});
	});
});
