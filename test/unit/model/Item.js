'use strict';

var util = require('util');
var Item = require('model/Item');
var Bag = require('model/Bag');
var Player = require('model/Player');
var Geo = require('model/Geo');
var Location = require('model/Location');
var OrderedHash = require('model/OrderedHash');


suite('Item', function () {

	suite('ctor', function () {

		test('enforces presence of core properties', function () {
			var i = new Item();
			assert.property(i, 'x');
			assert.property(i, 'y');
			assert.property(i, 'count');
		});

		test('enables collision detection where appropriate', function () {
			var i = new Item();
			assert.isFalse(i.collDet);
			i = new Item({onPlayerCollision: function dummy() {}});
			assert.isTrue(i.collDet);
			assert.property(i, '!colliders');
		});

		test('initializes message_queue as OrderedHash', function () {
			var i = new Item({message_queue: {b: 'b', a: 'a'}});
			assert.instanceOf(i.message_queue, OrderedHash);
			assert.strictEqual(i.message_queue.first(), 'a');
		});
	});


	suite('isHidden', function () {

		test('works as expected', function () {
			var i = new Item();
			assert.isFalse(i.isHidden);
			i = new Item({is_hidden: true});
			assert.isTrue(i.isHidden);
		});

		test('is not enumerable', function () {
			assert.notInclude(Object.keys(new Item()), 'isHidden');
		});
	});


	suite('isStack', function () {

		test('works as expected', function () {
			var i = new Item();
			assert.isFalse(i.isStack);
			var I = function () {};
			util.inherits(I, Item);
			I.prototype.stackmax = 17;
			i = new I();
			assert.isTrue(i.isStack);
		});
	});


	suite('updatePath', function () {

		test('does its job', function () {
			var p = new Player({tsid: 'P1'});
			var b1 = new Bag({tsid: 'B1'});
			var b2 = new Bag({tsid: 'B2'});
			var i = new Item({tsid: 'I1'});
			i.updatePath();
			assert.strictEqual(i.path, 'I1');
			i.container = b2;
			b2.container = b1;
			i.updatePath();
			assert.strictEqual(i.path, 'B1/B2/I1');
			b1.container = p;
			i.updatePath();
			assert.strictEqual(i.path, 'B1/B2/I1', 'player not included');
		});
	});


	suite('serialize', function () {

		test('does not include internal (non-enumerable) properties', function () {
			var data = {
				tsid: 'IFOO',
				label: 'Teapot',
				ts: 12345,
				count: 1,
				x: 123,
				y: 456,
				onPlayerCollision: function () {},
			};
			var i = new Item(data);
			delete data.onPlayerCollision;  // functions are not included in serialization
			assert.deepEqual(i.serialize(), data);
		});
	});


	suite('setContainer', function () {

		test('does its job', function () {
			var it = new Item({tsid: 'IT'});
			it.queueChanges = function noop() {};  // this part is not tested here
			var b = new Bag({tsid: 'BX', tcont: 'LDUMMY'});
			it.setContainer(b, 3, 7);
			assert.strictEqual(it.container, b);
			assert.strictEqual(it.tcont, 'LDUMMY');
			assert.strictEqual(it.path, 'BX/IT');
			assert.strictEqual(it.slot, 3);
			assert.notStrictEqual(it.y, 7);
			assert.strictEqual(b.items.IT, it);
			assert.isFalse(it.isHidden);
		});

		test('adds to hidden items list if specified', function () {
			var it = new Item({tsid: 'IT'});
			it.queueChanges = function noop() {};
			var b = new Bag({tcont: 'LFOO'});
			it.setContainer(b, 3, undefined, true);
			assert.notProperty(b.items, 'IT');
			assert.strictEqual(b.hiddenItems.IT, it);
			assert.strictEqual(it.slot, undefined, 'no slot number for hidden items');
			assert.isTrue(it.isHidden);
		});

		test('removes item from previous container', function () {
			var it = new Item({tsid: 'IT'});
			it.queueChanges = function noop() {};
			var b1 = new Bag({tcont: 'PCHEECH'});
			var b2 = new Bag({tcont: 'PCHONG'});
			it.setContainer(b1, 0);
			assert.isTrue('IT' in b1.items);
			it.setContainer(b2, 1);
			assert.isFalse('IT' in b1.items);
			assert.isTrue('IT' in b2.items);
		});

		test('can be used to move item to another slot', function () {
			var it = new Item({tsid: 'IT'});
			it.queueChanges = function noop() {};
			var b = new Bag({tcont: 'PXYZ'});
			it.setContainer(b, 1);
			assert.deepEqual(b.items, {IT: it});
			assert.strictEqual(it.container, b);
			assert.strictEqual(it.slot, 1);
			var c = 0;
			it.queueChanges = function count() {
				c++;
			};
			it.setContainer(b, 6);
			assert.deepEqual(b.items, {IT: it});
			assert.strictEqual(it.container, b);
			assert.strictEqual(it.slot, 6);
			assert.strictEqual(c, 1, 'only one change (addition/update) queued');
		});

		test('ignores slot property when adding to a location', function () {
			var it = new Item({tsid: 'IT'});
			it.queueChanges = function noop() {};
			var l = new Location({}, new Geo());
			it.setContainer(l);
			assert.isUndefined(it.slot);
			it.container = undefined;  // just so we can try again
			it.setContainer(l, 13, 29);
			assert.strictEqual(it.x, 13);
			assert.strictEqual(it.y, 29);
			assert.isUndefined(it.slot, 'does not set x coordinate as slot number');
		});

		test('fails if item is already in that container', function () {
			var it = new Item();
			it.queueChanges = function noop() {};
			var b = new Bag({tcont: 'LFOO'});
			it.setContainer(b, 7);
			assert.throw(function () {
				it.setContainer(b);
			}, assert.AssertionError);
		});

		test('fails with an invalid tcont property', function () {
			var it = new Item();
			var b = new Bag();
			assert.throw(function () {
				it.setContainer(b);
			}, assert.AssertionError);
		});

		test('fails with invalid or missing slot number', function () {
			var it = new Item();
			var b = new Bag({tsid: 'BX', tcont: 'LDUMMY', capacity: 10});
			assert.throw(function () {
				it.setContainer(b, 'a');
			}, assert.AssertionError);
			assert.throw(function () {
				it.setContainer(b);
			}, assert.AssertionError);
			assert.throw(function () {
				it.setContainer(b, 10);
			}, assert.AssertionError);
		});

		test('sends appropriate onContainerChanged events', function (done) {
			var it = new Item({tsid: 'IT'});
			it.queueChanges = function noop() {};
			it.onContainerChanged = function onContainerChanged(prev, curr) {
				assert.strictEqual(prev.tsid, 'LX');
				assert.strictEqual(curr.tsid, 'BX');
				done();
			};
			it.setContainer(new Location({tsid: 'LX'}, new Geo()));  // does not trigger onContainerChanged (no previous container)
			it.setContainer(new Bag({tsid: 'BX', tcont: 'LDUMMY'}), 3, 7);
		});

		test('sends appropriate onContainerItemAdded events', function (done) {
			var l = new Location({tsid: 'LX'}, new Geo());
			var l2 = new Location({tsid: 'LY'}, new Geo());
			var it1 = new Item({tsid: 'IT1'});
			it1.queueChanges = function noop() {};
			it1.setContainer(l);
			var it2 = new Item({tsid: 'IT2'});
			it2.queueChanges = function noop() {};
			it2.setContainer(l2);
			it1.onContainerItemAdded = function (it, prevCont) {
				assert.strictEqual(it.tsid, 'IT2');
				assert.strictEqual(prevCont.tsid, 'LY');
				done();
			};
			it2.setContainer(l);
		});

		test('sends appropriate onContainerItemRemoved events', function (done) {
			var b = new Bag({tsid: 'BX', tcont: 'LDUMMY'});
			var it1 = new Item({tsid: 'IT1'});
			it1.queueChanges = function noop() {};
			it1.setContainer(b, 1, 0);
			var it2 = new Item({tsid: 'IT2'});
			it2.queueChanges = function noop() {};
			it2.setContainer(b, 2, 0);
			it2.onContainerItemRemoved = function (it, newCont) {
				assert.strictEqual(it.tsid, 'IT1');
				assert.strictEqual(newCont.tsid, 'BY');
				done();
			};
			it1.setContainer(new Bag({tsid: 'BY', tcont: 'LDUMMY'}), 1, 0);
		});

		test('does not send change events for moves within a container',
			function () {
			var it = new Item({tsid: 'IT'});
			it.queueChanges = function noop() {};
			var b = new Bag({tsid: 'BX', tcont: 'LDUMMY'});
			it.setContainer(b, 3, 7);
			it.onContainerChanged = it.onContainerItemRemoved =
				it.onContainerItemAdded = function () {
				throw new Error('should not be called');
			};
			it.setContainer(b, 6, 7);  // move to different slot
		});
	});


	suite('getPosObject', function () {

		test('works with item in player inventory', function () {
			var it = new Item();
			var p = new Player();
			it.container = p;
			assert.strictEqual(it.getPosObject(), p, 'directly in player inventory');
			var b = new Bag();
			b.container = p;
			it.container = b;
			assert.strictEqual(it.getPosObject(), p, 'in a bag in inventory');
			var b2 = new Bag();
			b2.container = b;
			it.container = b2;
			assert.strictEqual(it.getPosObject(), p, 'in a nested bag in inventory');
		});

		test('works with item in location', function () {
			var it = new Item();
			var l = new Location({}, new Geo());
			it.container = l;
			assert.strictEqual(it.getPosObject(), it, 'directly in a location');
			var b = new Bag();
			b.container = l;
			it.container = b;
			assert.strictEqual(it.getPosObject(), b, 'in a bag in location');
			var b2 = new Bag();
			b2.container = b;
			it.container = b2;
			assert.strictEqual(it.getPosObject(), b, 'in a nested bag in location');
		});

		test('returns undefined for item without any container', function () {
			var it = new Item();
			assert.isUndefined(it.getPosObject());
		});
	});


	suite('del', function () {

		test('does its job', function () {
			var it = new Item();
			var b = new Bag({items: [it]});
			it.container = b;
			it.del();
			assert.deepEqual(b.items, {});
			assert.notProperty(it, 'container');
			assert.isTrue(it.deleted);
		});

		test('also deletes from container\'s hidden items list', function () {
			var it = new Item();
			var b = new Bag({hiddenItems: [it]});
			it.container = b;
			it.del();
			assert.deepEqual(b.hiddenItems, {});
			assert.notProperty(it, 'container');
			assert.isTrue(it.deleted);
		});
	});


	suite('consume', function () {

		test('works as expected', function () {
			var it = new Item({count: 7});
			var res = it.consume(5);
			assert.strictEqual(res, 5);
			assert.strictEqual(it.count, 2);
			assert.isFalse(it.deleted);
			res = it.consume(4);
			assert.strictEqual(res, 2);
			assert.strictEqual(it.count, 0);
			assert.isTrue(it.deleted);
		});

		test('fails with invalid argument', function () {
			var it = new Item({count: 7});
			assert.throw(function () {
				it.consume(-3);
			}, assert.AssertionError);
			assert.throw(function () {
				it.consume('moo');
			}, assert.AssertionError);
		});
	});


	suite('setXY', function () {

		test('rounds coordinates to integer numbers', function () {
			var it = new Item();
			it.setXY(1.1, -3.8);
			assert.strictEqual(it.x, 1);
			assert.strictEqual(it.y, -4);
		});

		test('returns whether the position actually changed', function () {
			var it = new Item({x: 1, y: 2});
			var res = it.setXY(1.1, -3.8);
			assert.isTrue(res);
			res = it.setXY(1.2, -3.9);
			assert.isFalse(res, 'still the same position after rounding');
			res = it.setXY(it.x, 5);
			assert.isTrue(res, 'only one coordinate changing is still a change');
		});
	});


	suite('hitBoxes', function () {

		test('add default hitbox', function () {
			var it = new Item();
			it.addHitBox(23, 23);
			assert.deepEqual(it.hitBox, {w: 23, h: 23}, 'added default hitbox');

			it.addHitBox(42, 42);
			assert.deepEqual(it.hitBox, {w: 42, h: 42}, 'changed default hitbox');
		});

		test('add named hitbox', function () {
			var it = new Item();
			it.addHitBox(23, 23, 'foo');
			assert.property(it, 'hitBoxes', 'created hitBoxes');
			assert.deepEqual(it.hitBoxes, {foo: {w: 23, h: 23}}, 'added hitbox');

			it.addHitBox(42, 42, 'bar');
			assert.deepEqual(Object.keys(it.hitBoxes).length, 2, 'added second hitbox');
		});

		test('removeHitBox', function () {
			var it = new Item();

			it.addHitBox(23, 23, 'foo');
			it.addHitBox(42, 42, 'bar');
			assert.deepEqual(Object.keys(it.hitBoxes).length, 2, 'added two hitboxes');

			var res = it.removeHitBox('foo');
			assert.deepEqual(Object.keys(it.hitBoxes).length, 1, 'removed hitbox');
			assert.deepEqual(res, true, 'result was true as a hitbox was removed');

			res = it.removeHitBox('does_not_exist');
			assert.deepEqual(Object.keys(it.hitBoxes).length, 1, 'one hitbox left');
			assert.deepEqual(res, false, 'result was false as no hitbox was removed');

			res = it.removeHitBox('bar');
			assert.notProperty(it, 'hitBoxes', 'property hitBoxes was removed');
			assert.deepEqual(res, true, 'result was true as a hitbox was removed');
		});
	});
});
