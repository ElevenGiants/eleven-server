'use strict';

var rewire = require('rewire');
var auth = require('comm/auth');
var abePassthrough = require('comm/abe/passthrough');
var Property = require('model/Property');
var Player = rewire('model/Player');
var Quest = require('model/Quest');
var Location = require('model/Location');
var DataContainer = require('model/DataContainer');
var Geo = require('model/Geo');
var Item = require('model/Item');
var RC = rewire('data/RequestContext');
var utils = require('utils');
var rpcMock = require('../../mock/rpc');
var persMock = require('../../mock/pers');


suite('Player', function () {

	setup(function () {
		RC.__set__('pers', persMock);
		persMock.reset();
	});

	teardown(function () {
		RC.__set__('pers', rewire('data/pers'));
		persMock.reset();
	});


	suite('ctor', function () {

		test('TSIDs of new Player objects start with P', function () {
			assert.strictEqual(new Player().tsid[0], 'P');
		});

		test('properties are initialized properly', function () {
			var p = new Player({tsid: 'P1', metabolics: {energy: 7000}});
			assert.instanceOf(p.metabolics.energy, Property);
			assert.strictEqual(p.metabolics.energy.value, 7000);
			p = new Player({tsid: 'P1', metabolics: {
				energy: {value: 50, bottom: 0, top: 800, label: 'energy'}},
			});
			assert.instanceOf(p.metabolics.energy, Property);
			assert.strictEqual(p.metabolics.energy.value, 50);
			assert.strictEqual(p.metabolics.energy.bottom, 0);
			assert.strictEqual(p.metabolics.energy.top, 800);
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
	});


	suite('startMove', function () {

		test('removes player from old loc and updates location property',
			function () {
			var lold = new Location({tsid: 'Lold'}, new Geo());
			var lnew = new Location({tsid: 'Lnew'}, new Geo());
			var p = new Player({tsid: 'P1', location: lold, x: 1, y: 1});
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

		test('calls onExit callbacks', function () {
			var itemOnPlayerExitCalled = false;
			var locOnPlayerExitCalled = false;
			var i = new Item({tsid: 'I'});
			var lold = new Location({tsid: 'Lold', items: [i]}, new Geo());
			var lnew = new Location({tsid: 'Lnew'}, new Geo());
			var p = new Player({tsid: 'P1', location: lold});
			i.onPlayerExit = function (player) {
				itemOnPlayerExitCalled = true;
				assert.strictEqual(player, p);
			};
			lold.onPlayerExit = function (player, newLoc) {
				locOnPlayerExitCalled = true;
				assert.strictEqual(player, p);
				assert.strictEqual(newLoc, lnew);
			};
			p.startMove(lnew, 0, 0);
			assert.isTrue(itemOnPlayerExitCalled);
			assert.isTrue(locOnPlayerExitCalled);
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

		test('calls onEnter callbacks', function () {
			var itemOnPlayerEnterCalled = false;
			var locOnPlayerEnterCalled = false;
			var i = new Item({tsid: 'I'});
			var l = new Location({tsid: 'L', items: [i]}, new Geo());
			var p = new Player({tsid: 'P1', location: l});
			i.onPlayerEnter = function (player) {
				itemOnPlayerEnterCalled = true;
				assert.strictEqual(player, p);
			};
			l.onPlayerEnter = function (player) {
				locOnPlayerEnterCalled = true;
				assert.strictEqual(player, p);
			};
			p.endMove();
			assert.isTrue(itemOnPlayerEnterCalled);
			assert.isTrue(locOnPlayerEnterCalled);
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
					assert.isTrue(logoutCalled, 'API event onLogout called');
					assert.isNull(p.session);
					assert.deepEqual(persMock.getUnloadList(), {P1: p});
					done();
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
					assert.deepEqual(persMock.getUnloadList(), {P1: p});
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
				assert.isNull(rc.postPersCallback);
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
				done();
			});
		});

		test('sends/schedules server messages required for GS reconnect',
			function (done) {
			rpcMock.reset(false);
			var p = new Player({tsid: 'P1', onGSLogout: function dummy() {}});
			var msgs = [];
			p.session = {send: function send(msg) {
				msgs.push(msg);
			}};
			var rc = new RC();
			rc.run(
				function () {
					p.gsMoveCheck('LREMOTE');
				},
				function callback(err, res) {
					assert.deepEqual(msgs, [
						{
							type: 'server_message',
							action: 'PREPARE_TO_RECONNECT',
							hostport: '12.34.56.78:1445',
							token: 'P1',
						},
						{
							type: 'server_message',
							action: 'CLOSE',
							msg: 'CONNECT_TO_ANOTHER_SERVER',
						},
					]);
					done(err);
				}
			);
		});
	});


	suite('getConnectedObjects', function () {

		test('does its job', function () {
			var p = new Player({tsid: 'P1',
				buffs: new DataContainer({label: 'Buffs'}),
				achievements: new DataContainer({label: 'Achievements'}),
				jobs: {
					todo: new DataContainer({label: 'To Do'}),
					done: new DataContainer({label: 'Done'}),
				},
				friends: {
					group1: new DataContainer({label: 'Buddies'}),
					reverse: new DataContainer({label: 'Reverse Contacts'}),
				},
				quests: {
					todo: new DataContainer({label: 'To Do', quests: {
						lightgreenthumb_1: new Quest(),
						soilappreciation_1: new Quest(),
					}}),
					done: new DataContainer({label: 'Done'}),
					// fail_repeat and misc missing on purpose
				},
			});
			var objects = p.getConnectedObjects();
			var keys = Object.keys(objects);
			assert.strictEqual(keys.filter(utils.isPlayer).length, 1);
			assert.strictEqual(keys.filter(utils.isDC).length, 8);
			assert.strictEqual(keys.filter(utils.isQuest).length, 2);
			assert.strictEqual(keys.length, 11,
				'does not contain any other objects');
		});
	});


	suite('unload', function () {

		test('does its job', function (done) {
			var p = new Player({tsid: 'P1',
				buffs: new DataContainer({tsid: 'DC1'}),
				jobs: {
					todo: new DataContainer({tsid: 'DC2'}),
				},
				quests: {
					todo: new DataContainer({tsid: 'DC3', quests: {
						lightgreenthumb_1: new Quest({tsid: 'Q1'}),
					}}),
				},
			});
			var rc = new RC();
			rc.run(
				function () {
					p.unload();
				},
				function callback(err, res) {
					if (err) return done(err);
					assert.sameMembers(Object.keys(persMock.getDirtyList()),
						['P1', 'DC1', 'DC2', 'DC3', 'Q1']);
					assert.sameMembers(Object.keys(persMock.getUnloadList()),
						['P1', 'DC1', 'DC2', 'DC3', 'Q1']);
					done();
				}
			);
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
				}}}}, {
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
				}},
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
				}}}
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
				}}},
				{
					location_tsid: 'LCANADA',
					itemstack_values: {
						pc: {
							IZ: {path_tsid: 'IZ'},
						},
						location: {
							IY: {path_tsid: 'IY'},
				}}},
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
			}}});
		});

		test('picks last change if multiple changes for the same item are queued',
			function () {
			var p = new Player();
			p.location = {tsid: 'L1'};
			p.changes = [
				{
					location_tsid: 'L1',
					itemstack_values: {
						location: {
							IX: {path_tsid: 'IX', count: 2},
				}}},
				{
					location_tsid: 'L1',
					itemstack_values: {
						location: {
							IX: {path_tsid: 'IX', count: 3},
				}}},
			];
			assert.deepEqual(p.mergeChanges(), {
				location_tsid: 'L1',
				itemstack_values: {
					pc: {},
					location: {
						IX: {path_tsid: 'IX', count: 3},
			}}});
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
});
