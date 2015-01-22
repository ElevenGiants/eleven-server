'use strict';

var Item = require('model/Item');
var Geo = require('model/Geo');
var Location = require('model/Location');


var STATUS = {
	DIR_CHANGE: 1,
	NO_PATH_TO_DEST: 2,
	ARRIVED_NEAR: 3,
	ARRIVED: 4,
	STOP_NEW_MOVE: 5,
	STOP: 6,
};

var plat1 = {
	start: {x: 10, y: 10},
	platform_item_perm: -1,
	platform_pc_perm: -1,
	end: {x: 20, y: 10}
};
var slope1 = {
	start: {x: 20, y: 10},
	platform_item_perm: -1,
	platform_pc_perm: -1,
	end: {x: 30, y: 15}
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
	slope_1: slope1,
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

// helper to create items that can move without a request context
function newItem(data) {
	var it = new Item(data);
	it.queueChanges = function queueChanges() {};
	return it;
}

// helper creating a dummy location and adding an item to it at a given position
function addToTestLoc(it, x, y, geo) {
	var l = new Location({tsid: 'L1', items: []}, geo);
	l.addItem(it, x, y);
}


suite('ItemMovement', function () {

	this.timeout(10000);
	this.slow(10000);

	suite('platform walking movement', function () {

		test('does not start if the item is already at the given destionation',
			function (done) {
			var i1 = newItem({tsid: 'I1', npc_walk_speed: 10});
			i1.doneMoving = function doneMoving(args) {
				assert.strictEqual(args.status, STATUS.ARRIVED);
				done();
			};
			addToTestLoc(i1, 10, 10, gPlat);
			var moveStarted = i1.gsStartMoving('walking', {x: 10, y: 10},
				{callback: 'doneMoving'});
			assert.isFalse(moveStarted);
		});

		test('does not start if there is no suitable platform', function (done) {
			var i1 = newItem({tsid: 'I1', npc_walk_speed: 10});
			i1.doneMoving = function doneMoving(args) {
				assert.isDefined(args.status);
				if (args.status !== STATUS.DIR_CHANGE) {
					assert.strictEqual(args.status, STATUS.ARRIVED_NEAR);
					done();
				}
			};
			addToTestLoc(i1, 35, 25, gPlat);  // on the edge of plat3, no way to go right
			var moveStarted = i1.gsStartMoving('walking', {x: 50, y: 25},
				{callback: 'doneMoving'});
			assert.isFalse(moveStarted);
		});

		test('walks towards target until no further platform is available',
			function (done) {
			var i1 = newItem({tsid: 'I1', npc_walk_speed: 10, npc_y_step: 3});
			i1.doneMoving = function doneMoving(args) {
				assert.isDefined(args.status);
				if (args.status === STATUS.DIR_CHANGE) {
					assert.strictEqual(args.dir, 'right');
				}
				else {
					assert.strictEqual(args.status, STATUS.ARRIVED_NEAR);
					assert.strictEqual(this.x, slope1.end.x);
					assert.strictEqual(this.y, slope1.end.y);
					done();
				}
			};
			addToTestLoc(i1, 18, 9, gPlat);
			// starting on plat1, walking right, will step onto slope1
			var moveStarted = i1.gsStartMoving('walking', {x: 200, y: 10},
				{callback: 'doneMoving'});
			assert.isTrue(moveStarted);
		});

		test('steps upwards onto higher platforms if y_step is big enough',
			function (done) {
			var i1 = newItem({tsid: 'I1', npc_walk_speed: 30, npc_y_step: 10});
			i1.doneMoving = function doneMoving(args) {
				assert.isDefined(args.status);
				if (args.status !== STATUS.DIR_CHANGE) {
					assert.strictEqual(args.status, STATUS.ARRIVED);
					assert.strictEqual(this.x, plat3.end.x);
					assert.strictEqual(this.y, plat3.end.y);
					done();
				}
			};
			addToTestLoc(i1, 10, 30, gPlat);
			// starts on plat2, moves right until the end, steps upwards onto plat3
			var moveStarted = i1.gsStartMoving('walking', {x: 35, y: 25},
				{callback: 'doneMoving'});
			assert.isTrue(moveStarted);
		});

		test('drops onto lower platforms if can_fall is true', function (done) {
			var i1 = newItem({tsid: 'I1', npc_walk_speed: 30, npc_y_step: 1,
				npc_can_fall: true});
			i1.doneMoving = function doneMoving(args) {
				assert.isDefined(args.status);
				if (args.status === STATUS.DIR_CHANGE) {
					assert.strictEqual(args.dir, 'left');
				}
				else if (args.status !== STATUS.DIR_CHANGE) {
					assert.strictEqual(args.status, STATUS.ARRIVED_NEAR);
					assert.strictEqual(this.x, plat2.start.x);
					assert.strictEqual(this.y, plat2.start.y);
					done();
				}
			};
			addToTestLoc(i1, 15, 9, gPlat);
			// starts on plat1, walks left, dropping to plat2
			var moveStarted = i1.gsStartMoving('walking', {x: -200, y: 10},
				{callback: 'doneMoving'});
			assert.isTrue(moveStarted);
		});

		test('walks through permeable walls, stops at blocking walls', function (done) {
			var i1 = newItem({tsid: 'I1', npc_walk_speed: 5, item_width: 4});
			i1.doneMoving = function doneMoving(args) {
				assert.isDefined(args.status);
				if (args.status === STATUS.DIR_CHANGE) {
					assert.strictEqual(args.dir, 'left');
				}
				else if (args.status !== STATUS.DIR_CHANGE) {
					assert.strictEqual(args.status, STATUS.ARRIVED_NEAR);
					assert.strictEqual(this.x, wall1.x + this.item_width / 2);
					assert.strictEqual(this.y, plat2.start.y);
					done();
				}
			};
			addToTestLoc(i1, 20, 9, gWall);
			// walks through wall2 (only blocks to the left) but stops at wall1
			var moveStarted = i1.gsStartMoving('walking', {x: -200, y: 10},
				{callback: 'doneMoving'});
			assert.isTrue(moveStarted);
		});

		test('supports explicitly supplied path (with multiple segments)',
			function (done) {
			var i1 = newItem({tsid: 'I1', npc_walk_speed: 50});
			var pt1 = {x: 20, y: 10, transport: 'walking'};
			var pt2 = {x: 10, y: 10, transport: 'walking'};
			var pt3 = {x: 22, y: 10, transport: 'walking'};
			var path = [pt1, pt2, pt3];
			i1.doneMoving = function doneMoving(args) {
				assert.isDefined(args.status);
				if (args.status === STATUS.DIR_CHANGE) {
					if (this.check === 0)
						assert.strictEqual(args.dir, 'right');
					else if (this.check === 1) {
						assert.strictEqual(args.dir, 'left');
						assert.strictEqual(this.x, pt1.x);
						assert.strictEqual(this.y, plat2.start.y);
					}
					else if (this.check === 2) {
						assert.strictEqual(args.dir, 'right');
						assert.strictEqual(this.x, pt2.x);
						assert.strictEqual(this.y, plat2.start.y);
					}
					this.check = this.check + 1;
				}
				else {
					assert.strictEqual(this.check, 3);
					assert.strictEqual(args.status, STATUS.ARRIVED);
					assert.deepEqual(this.movement.platform, plat2);
					assert.strictEqual(this.x, pt3.x);
					assert.strictEqual(this.y, plat2.start.y);
					done();
				}
			};
			addToTestLoc(i1, 15, plat2.start.y, gPlat);
			i1.check = 0;
			var moveStarted = i1.gsStartMoving('', {},
				{callback: 'doneMoving', path: path});
			assert.isTrue(moveStarted);
		});

		test('can be stopped mid-move', function (done) {
			var i1 = newItem({tsid: 'I1', npc_walk_speed: 10});
			i1.doneMoving = function doneMoving(args) {
				assert.isDefined(args.status);
				if (args.status === STATUS.DIR_CHANGE) {
					assert.strictEqual(args.dir, 'right');
				}
				else if (args.status !== STATUS.DIR_CHANGE) {
					assert.strictEqual(args.status, STATUS.STOP);
					assert.strictEqual(this.x, 24);
					assert.strictEqual(this.y, plat2.start.y);
					done();
				}
			};
			addToTestLoc(i1, 15, plat2.start.y, gPlat);
			var moveStarted = i1.gsStartMoving('walking', {x: 200, y: 10},
				{callback: 'doneMoving'});
			assert.isTrue(moveStarted);
			setTimeout(function () {
				i1.gsStopMoving();
			}, 1000);
		});

		test('interrupts current move when a new one is requested', function (done) {
			var i1 = newItem({tsid: 'I1', npc_walk_speed: 10});
			i1.doneMoving = function doneMoving(args) {
				assert.isDefined(args.status);
				if (this.stage === 0) {
					if (args.status === STATUS.DIR_CHANGE) {
						assert.strictEqual(args.dir, 'right');
					}
					else if (args.status !== STATUS.DIR_CHANGE) {
						assert.strictEqual(args.status, STATUS.STOP_NEW_MOVE);
						assert.strictEqual(this.x, 24);
						assert.strictEqual(this.y, plat2.start.y);
						this.stage = 1;
					}
				}
				else if (this.stage === 1) {
					if (args.status === STATUS.DIR_CHANGE) {
						assert.strictEqual(args.dir, 'left');
					}
					else if (args.status !== STATUS.DIR_CHANGE) {
						assert.strictEqual(args.status, STATUS.STOP);
						assert.strictEqual(this.x, 12);
						assert.strictEqual(this.y, plat2.start.y);
						done();
					}
				}
			};
			addToTestLoc(i1, 15, plat2.start.y, gPlat);
			i1.stage = 0;
			var moveStarted = i1.gsStartMoving('walking', {x: 200, y: 10},
				{callback: 'doneMoving'});
			assert.isTrue(moveStarted);
			setTimeout(function () {
				moveStarted = i1.gsStartMoving('walking', {x: -200, y: 10},
					{callback: 'doneMoving'});
				assert.isTrue(moveStarted);
				setTimeout(function () {
					i1.gsStopMoving();
				}, 700);
			}, 700);
		});
	});


	suite('direct movement', function () {

		test('ignores platforms', function (done) {
			var i1 = newItem({tsid: 'I1'});
			i1.doneMoving = function doneMoving(args) {
				assert.strictEqual(args.status, STATUS.ARRIVED);
				assert.strictEqual(this.x, 30);
				assert.strictEqual(this.y, 30);
				done();
			};
			addToTestLoc(i1, 0, 0, gPlat);
			var moveStarted = i1.gsStartMoving('direct', {x: 30, y: 30},
				{callback: 'doneMoving', speed: 60});
			assert.isTrue(moveStarted);
		});

		test('ignores walls', function (done) {
			var i1 = newItem({tsid: 'I1'});
			i1.doneMoving = function doneMoving(args) {
				assert.strictEqual(args.status, STATUS.ARRIVED);
				assert.strictEqual(this.x, 40);
				assert.strictEqual(this.y, 30);
				done();
			};
			addToTestLoc(i1, 0, 30, gWall);
			var moveStarted = i1.gsStartMoving('direct', {x: 40, y: 30},
				{callback: 'doneMoving', speed: 60});
			assert.isTrue(moveStarted);
		});
	});
});
