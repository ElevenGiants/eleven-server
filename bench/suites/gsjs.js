'use strict';

require('../setup');
var suite = new (require('benchmark')).Suite;
module.exports = suite;
var RC = require('data/RequestContext');
var pers = require('data/pers');
var pbeMock = require('../../test/mock/pbe');
var gsjsBridge = require('model/gsjsBridge');
var config = require('config');
var Group = require('model/Group');
var Geo = require('model/Geo');
var Location = require('model/Location');
var Player = require('model/Player');
var Item = require('model/Item');

var loc;
var pc;
var trant;
var apple;


// spoof a single common request context for all tests
RC.getContext = function getContext() {
	return new RC('DUMMY_BENCH_RC');
};


suite.asyncSetup = function (done) {
	pers.init(pbeMock);
	config.init(true, {
		gsjs: {
			config: 'config_prod',
		},
	});
	gsjsBridge.init(true, function cb() {
		// hi variants tracker group required for pc login:
		pers.create(Group, {tsid: 'RIFUKAGPIJC358O', class_tsid: 'hi_variants_tracker'});
		var geo = Geo.create({tsid: 'GXYZ', layers: {middleground: {
			platform_lines: {plat_1: {
				start: {x: -100, y: 0}, end: {x: 100, y: 0},
				platform_item_perm: -1, platform_pc_perm: -1,
		}}}}});
		loc = Location.create(geo);
		pc = Player.create({
			tsid: 'PXYYZ',
			label: 'Chuck',
			class_tsid: 'human',
			skip_newux: true,
			location: loc,
			x: 0, y: -100,
			last_location: {},
		});
		trant = Item.create('trant_bean');
		trant.setContainer(loc, 12, 34);
		trant.die = function () {};  // prevent dying
		apple = Item.create('apple');
		apple.setContainer(pc, 0);
		done();
	});
};


suite.on('complete', function () {
	process.exit();
});


suite.add('login_start', function () {
	gsjsBridge.getMain().processMessage(pc, {type: 'login_start'});
});


suite.add('login_end', function () {
	gsjsBridge.getMain().processMessage(pc, {type: 'login_end'});
});


suite.add('relogin_start', function () {
	gsjsBridge.getMain().processMessage(pc, {type: 'relogin_start'});
});


suite.add('relogin_end', function () {
	gsjsBridge.getMain().processMessage(pc, {type: 'relogin_end'});
});


suite.add('groups_chat', function () {
	gsjsBridge.getMain().processMessage(pc, {type: 'local_chat', txt: 'test!'});
});


suite.add('itemstack_verb_menu', function () {
	gsjsBridge.getMain().processMessage(pc, {type: 'itemstack_verb_menu',
		itemstack_tsid: trant.tsid});
});


suite.add('itemstack_verb', function () {
	gsjsBridge.getMain().processMessage(pc, {type: 'itemstack_verb',
		itemstack_tsid: apple.tsid, verb: 'lick'});
});


suite.add('move_xy', function () {
	gsjsBridge.getMain().processMessage(pc, {type: 'move_xy', x: 1, y: 1});
});


suite.add('trant.onInterval', function () {
	trant.onInterval();
});
