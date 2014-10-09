'use strict';

var Property = require('model/Property');
var Player = require('model/Player');
var Location = require('model/Location');
var Geo = require('model/Geo');
var Item = require('model/Item');


suite('Player', function () {

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
	
		test('properties are serialized as full objects', function () {
			var p = new Player({tsid: 'P1', stats: {xp: 23}});
			var data = JSON.parse(JSON.stringify(p.serialize()));
			assert.deepEqual(data.stats.xp,
				{value: 23, bottom: 23, top: 23, label: 'xp'});
		});
	});
	
	
	suite('startMove', function () {
	
		test('removes player from old loc and updates location property', function () {
			var lold = new Location({tsid: 'Lold'}, new Geo());
			var lnew = new Location({tsid: 'Lnew'}, new Geo());
			var p = new Player({tsid: 'P1', location: lold, x: 1, y: 1});
			lold.players[p.tsid] = p;
			p.startMove(lnew, 2, 3);
			assert.strictEqual(p.location, lnew);
			assert.strictEqual(p.x, 2);
			assert.strictEqual(p.y, 3);
			assert.lengthOf(Object.keys(lold.players), 0);
			assert.deepEqual(lnew.players, {}, 'player is not added to new loc yet');
		});
	
		test('works when player does not have a current location', function () {
			var p = new Player({tsid: 'P1'});
			var l = new Location({tsid: 'L'}, new Geo());
			p.startMove(l, 0, 0);
			assert.strictEqual(p.location, l);
			assert.deepEqual(l.players, {}, 'player is not added to new loc yet');
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
			assert.deepEqual(l.players, {}, 'player removed from location on logout');
			assert.strictEqual(p.location, l, 'location property unchanged after logout');
			assert.strictEqual(p.x, 3);
		});
	});
	
	
	suite('endMove', function () {
	
		test('adds player to player list in new loc', function () {
			var l = new Location({tsid: 'L'}, new Geo());
			var p = new Player({tsid: 'P1', location: l});
			p.endMove();
			assert.strictEqual(p.location, l);  // unchanged
			assert.deepEqual(l.players, {'P1': p}, 'player added to new loc');
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
});
