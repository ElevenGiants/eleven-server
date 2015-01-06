'use strict';

var Item = require('model/Item');
var Geo = require('model/Geo');
var Location = require('model/Location');

var plat1 = {
    start: {x: 10, y: 10},
    platform_item_perm: -1,
    platform_pc_perm: -1,
    end: {x: 20, y: 10}
};
var plat2 = {
    start: {x: 5, y: 30},
    platform_item_perm: -1,
    platform_pc_perm: -1,
    end: {x: 30, y: 30}
};
var plat3 = {
    start: {x: 15, y: 25},
    platform_item_perm: -1,
    platform_pc_perm: -1,
    end: {x: 35, y: 25},
};

var gPlat = new Geo({layers: {middleground: {platform_lines: {
    plat_1: plat1,
    plat_2: plat2,
    plat_3: plat3,
}}}});

var wall1 = {item_perm: 1, x: 10, y: 0, h: 50};
var wall2 = {item_perm: -1, x: 12, y: 0, h: 50};
var wall3 = {item_perm: 1, x: 20, y: 0, h: 50};
var wall4 = {item_perm: -1, x: 22, y: 0, h: 50};

var gWall = new Geo({layers: {middleground: {
    platform_lines: {plat: plat2},
    walls: {wall_1: wall1, wall_2: wall2, wall_3: wall3, wall_4: wall4},
}}});

// Helper to create moving items
function newItem(params) {
	var i1 = new Item(params);
	// Stubbed to make tests run without a requestContext
	i1.queueChanges = function queueChanges() {};
	return i1;
}

suite('ItemMovement', function () {
	suite('Move Walking', function () {
		test('stuck', function (done) {
			var i1 = newItem({tsid: 'I1', npc_walk_speed: 10});
			i1.doneMoving = function doneMoving(status) {
				assert.isDefined(status.status);
				if (status.status !== 1) {
					assert.strictEqual(status.status, 4);
					done();
				}
			};
			var l = new Location({tsid: 'L1', items: []}, gPlat);
			l.addItem(i1, 10, 10);
			var r = i1.startMoving('walking', {x: 10, y: 10},
				{callback: 'doneMoving'});
			assert.isFalse(r);
		});
		test('no walk speed', function (done) {
			var i1 = newItem({tsid: 'I1'});
			i1.doneMoving = function doneMoving(status) {
				assert.isDefined(status.status);
				if (status.status !== 1) {
					assert.strictEqual(status.status, 4);
					done();
				}
			};
			var l = new Location({tsid: 'L1', items: []}, gPlat);
			l.addItem(i1, 10, 10);
			var r = i1.startMoving('walking', {x: 20, y: 10},
				{callback: 'doneMoving'});
			assert.isFalse(r);
		});
		test('walk right', function (done) {
			var i1 = newItem({tsid: 'I1', npc_walk_speed: 3, npc_y_step: 1});
			i1.doneMoving = function doneMoving(status) {
				assert.isDefined(status.status);
				if (status.status === 1) {
					assert.strictEqual(status.dir, 'right');
				}
				else if (status.status !== 1) {
					assert.strictEqual(status.status, 3);
					assert.deepEqual(this.movement.platform, plat1);
					assert.strictEqual(this.x, plat1.end.x);
					assert.strictEqual(this.y, plat1.end.y);
					done();
				}
			};
			var l = new Location({tsid: 'L1', items: []}, gPlat);
			l.addItem(i1, 18, 9);
			var r = i1.startMoving('walking', {x: 200, y: 10},
				{callback: 'doneMoving'});
			assert.isTrue(r);
		});
		test('walk left', function (done) {
			var i1 = newItem({tsid: 'I1', npc_walk_speed: 3, npc_y_step: 1});
			i1.doneMoving = function doneMoving(status) {
				assert.isDefined(status.status);
				if (status.status === 1) {
					assert.strictEqual(status.dir, 'left');
				}
				else if (status.status !== 1) {
					assert.strictEqual(status.status, 3);
					assert.deepEqual(this.movement.platform, plat1);
					assert.strictEqual(this.x, plat1.start.x);
					assert.strictEqual(this.y, plat1.start.y);
					done();
				}
			};
			var l = new Location({tsid: 'L1', items: []}, gPlat);
			l.addItem(i1, 12, 9);
			var r = i1.startMoving('walking', {x: -200, y: 10},
				{callback: 'doneMoving'});
			assert.isTrue(r);
		});
		test('y_step', function (done) {
			var i1 = newItem({tsid: 'I1', npc_walk_speed: 30, npc_y_step: 10});
			i1.doneMoving = function doneMoving(status) {
				assert.isDefined(status.status);
				if (status.status === 1) {
					assert.strictEqual(status.dir, 'right');
				}
				else if (status.status !== 1) {
					assert.strictEqual(status.status, 3);
					assert.deepEqual(this.movement.platform, plat3);
					assert.strictEqual(this.x, plat3.end.x);
					assert.strictEqual(this.y, plat3.end.y);
					done();
				}
			};
			var l = new Location({tsid: 'L1', items: []}, gPlat);
			l.addItem(i1, 15, 9);
			var r = i1.startMoving('walking', {x: 200, y: 10},
				{callback: 'doneMoving'});
			assert.isTrue(r);
		});
		test('can_fall', function (done) {
			var i1 = newItem({tsid: 'I1', npc_walk_speed: 30, npc_y_step: 1,
					npc_can_fall: true});
			i1.doneMoving = function doneMoving(status) {
				assert.isDefined(status.status);
				if (status.status === 1) {
					assert.strictEqual(status.dir, 'left');
				}
				else if (status.status !== 1) {
					assert.strictEqual(status.status, 3);
					assert.deepEqual(this.movement.platform, plat2);
					assert.strictEqual(this.x, plat2.start.x);
					assert.strictEqual(this.y, plat2.start.y);
					done();
				}
			};
			var l = new Location({tsid: 'L1', items: []}, gPlat);
			l.addItem(i1, 15, 9);
			var r = i1.startMoving('walking', {x: -200, y: 10},
				{callback: 'doneMoving'});
			assert.isTrue(r);
		});
		test('wall_left', function (done) {
			var i1 = newItem({tsid: 'I1', npc_walk_speed: 5, item_width: 4});
			i1.doneMoving = function doneMoving(status) {
				assert.isDefined(status.status);
				if (status.status === 1) {
					assert.strictEqual(status.dir, 'left');
				}
				else if (status.status !== 1) {
					assert.strictEqual(status.status, 3);
					assert.deepEqual(this.movement.platform, plat2);
					assert.strictEqual(this.x, wall1.x + this.item_width / 2);
					assert.strictEqual(this.y, plat2.start.y);
					done();
				}
			};
			var l = new Location({tsid: 'L1', items: []}, gWall);
			l.addItem(i1, 20, 9);
			var r = i1.startMoving('walking', {x: -200, y: 10},
				{callback: 'doneMoving'});
			assert.isTrue(r);
		});
		test('wall_right', function (done) {
			var i1 = newItem({tsid: 'I1', npc_walk_speed: 5, item_width: 4});
			i1.doneMoving = function doneMoving(status) {
				assert.isDefined(status.status);
				if (status.status === 1) {
					assert.strictEqual(status.dir, 'right');
				}
				else if (status.status !== 1) {
					assert.strictEqual(status.status, 3);
					assert.deepEqual(this.movement.platform, plat2);
					assert.strictEqual(this.x, wall4.x - this.item_width / 2);
					assert.strictEqual(this.y, plat2.start.y);
					done();
				}
			};
			var l = new Location({tsid: 'L1', items: []}, gWall);
			l.addItem(i1, 15, 9);
			var r = i1.startMoving('walking', {x: 200, y: 10},
				{callback: 'doneMoving'});
			assert.isTrue(r);
		});
		test('multi_path', function (done) {
			var i1 = newItem({tsid: 'I1', npc_walk_speed: 50});
			var pt1 = {x: 20, y: 10, transport: 'walking'};
			var pt2 = {x: 10, y: 10, transport: 'walking'};
			var pt3 = {x: 22, y: 10, transport: 'walking'};
			var path = [pt1, pt2, pt3];
			i1.doneMoving = function doneMoving(status) {
				assert.isDefined(status.status);
				if (status.status === 1) {
					if (this.check === 0)
						assert.strictEqual(status.dir, 'right');
					else if (this.check === 1) {
						assert.strictEqual(status.dir, 'left');
						assert.strictEqual(this.x, pt1.x);
						assert.strictEqual(this.y, plat2.start.y);
					}
					else if (this.check === 2) {
						assert.strictEqual(status.dir, 'right');
						assert.strictEqual(this.x, pt2.x);
						assert.strictEqual(this.y, plat2.start.y);
					}
					this.check = this.check + 1;
				}
				else if (status.status !== 1) {
					assert.strictEqual(this.check, 4);
					assert.strictEqual(status.status, 4);
					assert.deepEqual(this.movement.platform, plat2);
					assert.strictEqual(this.x, pt3.x);
					assert.strictEqual(this.y, plat2.start.y);
					done();
				}
			};
			var l = new Location({tsid: 'L1', items: []}, gPlat);
			l.addItem(i1, 15, plat2.start.y);
			i1.check = 0;
			var r = i1.startMoving('', {}, {callback: 'doneMoving', path: path});
			assert.isTrue(r);
		});
		test('stop', function (done) {
			var l = new Location({tsid: 'L1', items: []}, gPlat);
			var i1 = newItem({tsid: 'I1', npc_walk_speed: 10});
			i1.doneMoving = function doneMoving(status) {
				assert.isDefined(status.status);
				if (status.status === 1) {
					assert.strictEqual(status.dir, 'right');
				}
				else if (status.status !== 1) {
					assert.strictEqual(status.status, 6);
					assert.deepEqual(this.movement.platform, plat2);
					assert.strictEqual(this.x, 24);
					assert.strictEqual(this.y, plat2.start.y);
					done();
				}
			};
			l.addItem(i1, 15, plat2.start.y);
			var r = i1.startMoving('walking', {x: 200, y: 10},
				{callback: 'doneMoving'});
			assert.isTrue(r);
			setTimeout(function () {
				i1.stopMoving();
			}, 1000);
		});
		test('new_move', function (done) {
			var l = new Location({tsid: 'L1', items: []}, gPlat);
			var i1 = newItem({tsid: 'I1', npc_walk_speed: 10});
			i1.doneMoving = function doneMoving(status) {
				assert.isDefined(status.status);
				if (this.stage === 0) {
					if (status.status === 1) {
						assert.strictEqual(status.dir, 'right');
					}
					else if (status.status !== 1) {
						assert.strictEqual(status.status, 5);
						assert.deepEqual(this.movement.platform, plat2);
						assert.strictEqual(this.x, 24);
						assert.strictEqual(this.y, plat2.start.y);
						this.stage = 1;
					}
				}
				else if (this.stage === 1) {
					if (status.status === 1) {
						assert.strictEqual(status.dir, 'left');
					}
					else if (status.status !== 1) {
						assert.strictEqual(status.status, 6);
						assert.deepEqual(this.movement.platform, plat2);
						assert.strictEqual(this.x, 12);
						assert.strictEqual(this.y, plat2.start.y);
						done();
					}
				}
			};
			l.addItem(i1, 15, plat2.start.y);
			i1.stage = 0;
			var r = i1.startMoving('walking', {x: 200, y: 10},
				{callback: 'doneMoving'});
			assert.isTrue(r);
			setTimeout(function () {
				r = i1.startMoving('walking', {x: -200, y: 10},
					{callback: 'doneMoving'});
				assert.isTrue(r);
				setTimeout(function () {
					i1.stopMoving();
				}, 700);
			}, 700);
		});
	});
	suite('Move Direct', function () {
		test('works through platforms', function (done) {
			var i1 = newItem({tsid: 'I1'});
			var pt1 = {x: 30, y: 30};
			i1.doneMoving = function doneMoving(status) {
				assert.isDefined(status.status);
				assert.strictEqual(status.status, 4);
				assert.strictEqual(this.x, pt1.x);
				assert.strictEqual(this.y, pt1.y);
				done();
			};
			var l = new Location({tsid: 'L1', items: []}, gPlat);
			l.addItem(i1, 0, 0);
			var r = i1.startMoving('direct', {x: pt1.x, y: pt1.y},
				{callback: 'doneMoving', speed: 60});
			assert.isTrue(r);
		});
		test('works through walls', function (done) {
			var i1 = newItem({tsid: 'I1'});
			var pt1 = {x: 40, y: 30};
			i1.doneMoving = function doneMoving(status) {
				assert.isDefined(status.status);
				assert.strictEqual(status.status, 4);
				assert.strictEqual(this.x, pt1.x);
				assert.strictEqual(this.y, pt1.y);
				done();
			};
			var l = new Location({tsid: 'L1', items: []}, gWall);
			l.addItem(i1, 0, 30);
			var r = i1.startMoving('direct', {x: pt1.x, y: pt1.y},
				{callback: 'doneMoving', speed: 60});
			assert.isTrue(r);
		});
	});
});
