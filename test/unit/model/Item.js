'use strict';

var util = require('util');
var Item = require('model/Item');
var Bag = require('model/Bag');
var Player = require('model/Player');
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
			var b = new Bag({tsid: 'BX', tcont: 'meh'});
			it.setContainer(b);
			assert.strictEqual(it.container, b);
			assert.strictEqual(it.tcont, 'meh');
			assert.strictEqual(it.path, 'BX/IT');
			assert.strictEqual(b.items.IT, it);
			assert.isFalse(it.isHidden);
		});

		test('adds to hidden items list if specified', function () {
			var it = new Item({tsid: 'IT'});
			var b = new Bag();
			it.setContainer(b, true);
			assert.notProperty(b.items, 'IT');
			assert.strictEqual(b.hiddenItems.IT, it);
			assert.isTrue(it.isHidden);
		});

		test('removes item from previous container', function () {
			var it = new Item({tsid: 'IT'});
			var b1 = new Bag();
			var b2 = new Bag();
			it.setContainer(b1);
			assert.isTrue('IT' in b1.items);
			it.setContainer(b2);
			assert.isFalse('IT' in b1.items);
			assert.isTrue('IT' in b2.items);
		});

		test('fails if item is already in that container', function () {
			var it = new Item();
			var b = new Bag();
			it.setContainer(b);
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
});
