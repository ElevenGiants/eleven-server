'use strict';

var Bag = require('model/Bag');
var Item = require('model/Item');


suite('Bag', function () {

	suite('ctor', function () {

		test('initializes items and hiddenItems properties', function () {
			var b = new Bag();
			assert.deepEqual(b.items, {});
			assert.deepEqual(b.hiddenItems, {});
			b = new Bag({
				items: [
					new Item({tsid: 'IASDF', x: 13, container: b}),
					new Item({tsid: 'IFOO', container: b}),
				],
			});
			assert.property(b.items, 'IASDF');
			assert.property(b.items, 'IFOO');
			// creates slot property for contained items
			assert.strictEqual(b.items.IASDF.slot, 13);
			assert.strictEqual(b.items.IFOO.slot, 0);  // item coordinates are initialized to 0/0
		});
	});


	suite('serialize', function () {

		test('works as expected', function () {
			var items = [
				new Item({tsid: 'IASDF', x: 13}),
				new Item({tsid: 'IFOO'}),
			];
			var hiddenItems = [
				new Item({tsid: 'IHIDDEN'}),
			];
			var b = new Bag({
				items: items,
				hiddenItems: hiddenItems,
			});
			var bs = b.serialize();
			assert.isArray(bs.items);
			assert.lengthOf(bs.items, 2);
			assert.sameMembers(bs.items, items);
			assert.isArray(bs.hiddenItems);
			assert.lengthOf(bs.hiddenItems, 1);
			assert.sameMembers(bs.hiddenItems, hiddenItems);
		});
	});


	suite('getAllItems', function () {

		test('works as expected', function () {
			var i1 = new Item({tsid: 'I1'});
			var i2 = new Item({tsid: 'I2'});
			var i3 = new Item({tsid: 'I3'});
			var i4 = new Item({tsid: 'I4'});
			var i5 = new Item({tsid: 'I5'});
			var b3 = new Bag({tsid: 'B3', items: [i5]});
			var b2 = new Bag({tsid: 'B2', items: [i4, b3], hiddenItems: [i3]});
			var b1 = new Bag({tsid: 'B1', items: [i1, b2, i2]});
			//jscs:disable disallowQuotedKeysInObjects
			assert.deepEqual(b1.getAllItems(true), {
				'I1': i1,
				'I2': i2,
				'B2': b2,
				'B2/I3': i3,
				'B2/I4': i4,
				'B2/B3': b3,
				'B2/B3/I5': i5,
			});
			assert.deepEqual(b1.getAllItems(), {
				'I1': i1,
				'I2': i2,
				'B2': b2,
				// hidden item B2/I3 not included
				'B2/I4': i4,
				'B2/B3': b3,
				'B2/B3/I5': i5,
			});
			//jscs:enable disallowQuotedKeysInObjects
		});
	});


	suite('getClassItems', function () {

		test('works as expected', function () {
			var i1 = new Item({tsid: 'I1', class_tsid: 'apple', count: 10});
			var i2 = new Item({tsid: 'I2', class_tsid: 'pi'});
			var i3 = new Item({tsid: 'I3', class_tsid: 'apple', count: 5});
			var i4 = new Item({tsid: 'I4', class_tsid: 'banana', count: 7});
			var i5 = new Item({tsid: 'I5', class_tsid: 'apple', count: 3});
			var b = new Bag({tsid: 'B1', items: [i1, i2, i3, i4, i5]});
			assert.deepEqual(b.getClassItems('apple'), {I1: i1, I3: i3, I5: i5});
			assert.deepEqual(b.getClassItems('apple', 13), {I1: i1, I3: i3});
			assert.deepEqual(b.getClassItems('banana'), {I4: i4});
			assert.deepEqual(b.getClassItems('rhubarb'), {});
		});
	});

	suite('getItems', function () {

		test('works as expected', function () {
			var i1 = new Item({tsid: 'I1', class_tsid: 'apple', count: 10});
			var i2 = new Item({tsid: 'I2', class_tsid: 'apple', count: 5});
			var i3 = new Item({tsid: 'I3', class_tsid: 'apple', count: 3});
			var b = new Bag({tsid: 'B1', class_tsid: 'bag_furniture_sdb',
				items: [i1, i2, i3]});
			assert.deepEqual(b.getItems('apple', 1), {I1: i1});
			assert.deepEqual(b.getItems('apple', 9), {I1: i1});
			assert.deepEqual(b.getItems('apple', 10), {I1: i1});
			assert.deepEqual(b.getItems('apple', 11), {I1: i1, I2: i2});
			assert.deepEqual(b.getItems('apple', 12), {I1: i1, I2: i2});
			assert.deepEqual(b.getItems('apple', 14), {I1: i1, I2: i2});
			assert.deepEqual(b.getItems('apple', 15), {I1: i1, I2: i2});
			assert.deepEqual(b.getItems('apple', 16), {I1: i1, I2: i2, I3: i3});
			assert.deepEqual(b.getItems('apple', 17), {I1: i1, I2: i2, I3: i3});
			assert.deepEqual(b.getItems('apple', 19), {I1: i1, I2: i2, I3: i3});
			assert.deepEqual(b.getItems('apple', -1), {I1: i1, I2: i2, I3: i3});
			assert.deepEqual(b.getItems('apple', undefined), {I1: i1, I2: i2, I3: i3});
		});
	});


	suite('del', function () {

		test('deletes contents recursively', function () {
			var i1 = new Item({tsid: 'I1'});
			var i2 = new Item({tsid: 'I2'});
			var b3 = new Bag({tsid: 'B3', items: [i2]});
			i2.container = b3;
			var b2 = new Bag({tsid: 'B2', items: [b3], hiddenItems: [i1]});
			b3.container = b2;
			i1.container = b2;
			var b1 = new Bag({tsid: 'B1', items: [b2]});
			b2.container = b1;
			b1.del();
			assert.isTrue(i1.deleted);
			assert.isTrue(i2.deleted);
			assert.isTrue(b1.deleted);
			assert.isTrue(b2.deleted);
			assert.isTrue(b3.deleted);
			assert.deepEqual(b1.items, {});
			assert.deepEqual(b2.items, {});
			assert.deepEqual(b3.items, {});
			assert.deepEqual(b2.hiddenItems, {});
		});
	});


	suite('getSlot', function () {

		test('does its job', function () {
			var i1 = new Item({tsid: 'I1', x: 5});
			var b = new Bag({tsid: 'B123', items: [i1]});
			assert.strictEqual(b.getSlot(5), i1);
			assert.isNull(b.getSlot(7));
		});
	});


	suite('getSlotOrPath', function () {

		test('does its job', function () {
			var i1 = new Item({tsid: 'I1', x: 0});
			var i2 = new Item({tsid: 'I1', x: 4});
			var b1 = new Bag({tsid: 'B1', items: [i1], x: 3});
			var b2 = new Bag({tsid: 'B2', items: [b1, i2]});
			assert.strictEqual(b2.getSlotOrPath(0), null);
			assert.strictEqual(b2.getSlotOrPath(4), i2);
			assert.strictEqual(b2.getSlotOrPath(3), b1);
			assert.strictEqual(b2.getSlotOrPath('B1'), b1);
			assert.strictEqual(b1.getSlotOrPath(0), i1);
			assert.strictEqual(b1.getSlotOrPath('I1'), i1);
			assert.strictEqual(b2.getSlotOrPath('B1/I1'), i1);
		});

		test('returns null for invalid argument', function () {
			var b = new Bag({tsid: 'BB'});
			assert.isNull(b.getSlotOrPath());
			assert.isNull(b.getSlotOrPath(null));
			assert.isNull(b.getSlotOrPath('mofo'));
			assert.isNull(b.getSlotOrPath(8000));
		});
	});


	suite('getSlots', function () {

		test('does its job', function () {
			var i1 = new Item({tsid: 'I1', x: 3});
			var i2 = new Item({tsid: 'I2', x: 0});
			var i3 = new Item({tsid: 'I3', x: 5});
			var b = new Bag({tsid: 'B123', items: [i1, i2, i3]});
			assert.deepEqual(b.getSlots(4), [i2, null, null, i1]);
		});
	});


	suite('addToSlot', function () {

		test('works with string-type slot argument', function () {
			var i1 = new Item({tsid: 'I1'});
			var i2 = new Item({tsid: 'I2', x: 123, y: 345});
			var b = new Bag({tsid: 'B1', tcont: 'PDUMMY'});
			b.capacity = 1;
			// changeset creation not tested here:
			i1.queueChanges = i2.queueChanges = b.queueChanges = function noop() {};
			b.addToSlot(i1, 0);
			var merged = b.addToSlot(i2, '0');  // GSJS actually does this :/
			assert.strictEqual(merged, 0, 'not added to occupied slot');
			assert.deepEqual(b.items, {I1: i1});
			assert.strictEqual(i1.slot, 0);
			assert.isUndefined(i2.slot);
			assert.strictEqual(i2.x, 123);
		});
	});
});
