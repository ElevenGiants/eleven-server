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
			it.setContainer(b, 3);
			assert.strictEqual(it.container, b);
			assert.strictEqual(it.tcont, 'LDUMMY');
			assert.strictEqual(it.path, 'BX/IT');
			assert.strictEqual(it.slot, 3);
			assert.strictEqual(b.items.IT, it);
			assert.isFalse(it.isHidden);
		});

		test('adds to hidden items list if specified', function () {
			var it = new Item({tsid: 'IT'});
			it.queueChanges = function noop() {};
			var b = new Bag({tcont: 'LFOO'});
			it.setContainer(b, 3, true);
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

		test('removes slot property when adding to a location', function () {
			var it = new Item({tsid: 'IT'});
			it.queueChanges = function noop() {};
			it.slot = 7;
			var l = new Location({}, new Geo());
			it.setContainer(l);
			assert.isUndefined(it.slot);
			it.container = undefined;  // just so we can try again
			it.setContainer(l, 13);
			assert.isUndefined(it.slot, 'slot number argument is ignored');
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
			var b = new Bag({tsid: 'BX', tcont: 'LDUMMY'});
			assert.throw(function () {
				it.setContainer(b, 'a');
			}, assert.AssertionError);
			assert.throw(function () {
				it.setContainer(b);
			}, assert.AssertionError);
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
});
