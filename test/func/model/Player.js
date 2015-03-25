'use strict';

var gsjsBridge = require('model/gsjsBridge');
var RC = require('data/RequestContext');
var Player = require('model/Player');
var Location = require('model/Location');
var Geo = require('model/Geo');
var Item = require('model/Item');
var Bag = require('model/Bag');
var pers = require('data/pers');
var utils = require('utils');
var pbeMock = require('../../mock/pbe');
var helpers = require('../../helpers');


suite('Player', function () {

	setup(function () {
		gsjsBridge.init(true);
		pers.init(pbeMock);
	});

	teardown(function () {
		gsjsBridge.reset();
		pers.init();  // disable mock back-end
	});


	suite('create', function () {

		test('does its job', function (done) {
			var p;
			var rc = new RC();
			rc.run(
				function () {
					var g = Geo.create();
					rc.cache[g.tsid] = g;
					var l = Location.create({geo: g});
					rc.cache[l.tsid] = l;
					p = Player.create({
						label: 'Edgar',
						userid: '123',
						location: l,
						skip_newux: true,  // just so we're not reliant on newux location data
					});
					assert.isTrue(p.__isPP);
					assert.isTrue(utils.isPlayer(p));
					assert.strictEqual(p.class_tsid, 'human');
					assert.strictEqual(p.label, 'Edgar');
					assert.isTrue(utils.isDC(p.skills));
					assert.isTrue(utils.isDC(p.quests.todo));
				},
				function cb(err, res) {
					if (err) return done(err);
					var db = pbeMock.getDB();
					assert.isTrue(pbeMock.getCounts().write > 1);
					assert.property(db, p.tsid);
					assert.property(db, p.skills.tsid);
					assert.property(db, p.groups.tsid);
					assert.property(db, p.furniture.storage_tsid);
					done();
				}
			);
		});

		test('fails with missing properties', function () {
			assert.throw(function () {
				Player.create({userid: '123', label: 'Ezekiel'});
			}, assert.AssertionError);  // location is missing
		});

		test('fails with invalid properties', function () {
			assert.throw(function () {
				Player.create({userid: 123});
			}, assert.AssertionError); // userid expected to be a string
		});
	});


	suite('addToAnySlot', function () {

		test('adds to player inventory, splits items if necessary',
			function (done) {
			var rc = new RC();
			rc.run(function () {
				var p = new Player({location: {tsid: 'LDUMMY'}});
				rc.cache[p.tsid] = p;
				var i1 = Item.create('apple', 3);
				var remaining = p.addToAnySlot(i1, 0, 16, null, 2);
				assert.strictEqual(remaining, 0);
				assert.strictEqual(i1.count, 1);
				assert.lengthOf(Object.keys(p.items), 1);
				var i2 = p.getSlot(0);
				assert.strictEqual(i2.class_tsid, 'apple');
				assert.strictEqual(i2.count, 2);
			}, done);
		});

		test('adds to bag in inventory, deletes source item if necessary',
			function (done) {
			var rc = new RC();
			rc.run(function () {
				var b = Bag.create('bag_bigger_gray');
				var p = new Player({location: {tsid: 'LDUMMY'}});
				rc.cache[p.tsid] = p;
				b.setContainer(p, 1);
				var i1 = Item.create('apple', 3);
				b.addToSlot(i1, 0);
				var i2 = Item.create('apple', 3);
				var remaining = p.addToAnySlot(i2, 0, 16, b.path);
				assert.strictEqual(remaining, 0);
				assert.strictEqual(b.getSlot(0), i1);
				assert.strictEqual(i1.count, 6);
				assert.strictEqual(i2.count, 0);
				assert.isTrue(i2.deleted);
			}, done);
		});

		test('distributes across multiple slots', function (done) {
			var rc = new RC();
			rc.run(function () {
				var p = new Player({location: {tsid: 'LDUMMY'}});
				rc.cache[p.tsid] = p;
				var i1 = Item.create('apple', 3);
				i1.stackmax = 5;
				p.addToSlot(i1, 0);
				var i2 = Item.create('apple', 6);
				var remaining = p.addToAnySlot(i2, 0, 16);
				assert.strictEqual(remaining, 0);
				assert.strictEqual(p.getSlot(0), i1);
				assert.strictEqual(p.getSlot(1), i2);
				assert.strictEqual(i1.count, 5);
				assert.strictEqual(i2.count, 4);
			}, done);
		});

		test('returns number of remaining items', function (done) {
			var rc = new RC();
			rc.run(function () {
				var p = new Player({location: {tsid: 'LDUMMY'}});
				rc.cache[p.tsid] = p;
				var i1 = Item.create('apple', 3);
				i1.stackmax = 5;
				p.addToSlot(i1, 0);
				var i2 = Item.create('apple', 6);
				var remaining = p.addToAnySlot(i2, 0, 0);  // only allow slot 0
				assert.strictEqual(remaining, 4);
			}, done);
		});
	});


	suite('queueChanges', function () {

		test('works as expected (basic changeset)', function (done) {
			new RC().run(function () {
				var p = helpers.getOnlinePlayer(
					{tsid: 'PX', location: {tsid: 'LDUMMY'}});
				var it = new Item(
					{tsid: 'IX', class_tsid: 'meat', count: 3, tcont: 'PX'});
				p.queueChanges(it);
				assert.lengthOf(p.changes, 1);
				var cs = p.changes[0];
				assert.strictEqual(cs.location_tsid, 'LDUMMY');
				assert.lengthOf(Object.keys(cs.itemstack_values.pc), 1);
				assert.lengthOf(Object.keys(cs.itemstack_values.location), 0);
				var cd = cs.itemstack_values.pc[it.tsid];
				assert.strictEqual(cd.class_tsid, 'meat');
				assert.strictEqual(cd.count, 3);
				assert.strictEqual(cd.path_tsid, it.tsid);
			}, done);
		});

		test('works as expected (basic removal changeset)', function (done) {
			new RC().run(function () {
				var p = helpers.getOnlinePlayer(
					{tsid: 'PX', location: {tsid: 'LDUMMY'}});
				var it = new Item(
					{tsid: 'IX', class_tsid: 'meat', count: 3, tcont: 'PX'});
				p.queueChanges(it, true);
				var cs = p.changes[0];
				assert.lengthOf(Object.keys(cs.itemstack_values.pc), 1);
				assert.lengthOf(Object.keys(cs.itemstack_values.location), 0);
				assert.strictEqual(cs.itemstack_values.pc[it.tsid].count, 0);
			}, done);
		});

		test('works as expected (location changesets)', function (done) {
			new RC().run(function () {
				var p = helpers.getOnlinePlayer({tsid: 'PX', location: {tsid: 'LX'}});
				var it = new Item({tsid: 'IX', class_tsid: 'apple', tcont: 'LX'});
				p.queueChanges(it);  // added to location
				p.queueChanges(it, true);  // removed from location again
				assert.lengthOf(p.changes, 2);
				assert.strictEqual(
					p.changes[0].itemstack_values.location[it.tsid].count, 1);
				assert.strictEqual(
					p.changes[1].itemstack_values.location[it.tsid].count, 0);
			}, done);
		});

		test('skips items not visible for the player', function (done) {
			new RC().run(function () {
				var p = new Player({tsid: 'PX', location: {tsid: 'LX'}});
				var it = new Item({tsid: 'IX', class_tsid: 'quoin', tcont: 'LX',
					only_visible_to: 'POTHER'});
				p.queueChanges(it);
				assert.lengthOf(p.changes, 0);
			}, done);
		});
	});


	suite('send', function () {

		test('includes combined changes', function (done) {
			var rc = new RC();
			rc.run(
				function () {
					var g = Geo.create();
					var l = Location.create({geo: g});
					var p = new Player({tsid: 'PX', location: l});
					l.players[p.tsid] = p;
					rc.cache[g.tsid] = g;
					rc.cache[l.tsid] = l;
					rc.cache[p.tsid] = p;
					var it = new Item({tsid: 'IX', class_tsid: 'pi',
						tcont: l.tsid, container: l});
					p.session = {
						send: function send(msg) {
							assert.strictEqual(msg.changes.location_tsid, l.tsid);
							var iv = msg.changes.itemstack_values;
							assert.lengthOf(Object.keys(iv.pc), 1);
							assert.lengthOf(Object.keys(iv.location), 1);
							assert.strictEqual(iv.pc.IX.count, 1);
							assert.strictEqual(iv.pc.IX.slot, 5);
							assert.strictEqual(iv.location.IX.count, 0);
							done();
						},
					};
					p.addToSlot(it, 5);
					p.send({});
				},
				function (err, res) {
					if (err) return done(err);
				}
			);
		});

		test('includes queued announcements', function (done) {
			new RC().run(
				function () {
					var p = new Player();
					p.session = {
						send: function send(msg) {
							var anncs = msg.announcements;
							assert.lengthOf(anncs, 2);
							assert.deepEqual(p.anncs, []);
							assert.strictEqual(anncs[0].id, 'someAnnc');
							assert.strictEqual(anncs[1].mo2, 'problems');
							assert.deepEqual(origMsg, {}, 'announcements ' +
								'not added to original message parameter');
							done();
						},
					};
					p.queueAnnc({id: 'someAnnc', data: 5});
					p.queueAnnc({mo1: 'money', mo2: 'problems'});
					var origMsg = {};
					p.send(origMsg);
				},
				function (err, res) {
					if (err) return done(err);
				}
			);
		});

		test('includes property changes', function (done) {
			new RC().run(
				function () {
					var p = new Player();
					p.stats.xp.setLimits(0, 1000);
					p.stats.xp.setVal(555);
					p.session = {
						send: function send(msg) {
							assert.deepEqual(msg.changes.stat_values, {xp: 555});
							assert.strictEqual(msg.moo, 'far');
							assert.deepEqual(origMsg, {moo: 'far'}, 'changes ' +
								'not added to original message parameter');
							done();
						},
					};
					var origMsg = {moo: 'far'};
					p.send(origMsg);
				},
				function (err, res) {
					if (err) return done(err);
				}
			);
		});
	});
});
