'use strict';

var util = require('util');
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
					new Item({tsid: 'IASDF', x: 13}),
					new Item({tsid: 'IFOO'}),
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
			assert.deepEqual(b1.getAllItems(), {
				'I1': i1,
				'I2': i2,
				'B2': b2,
				'B2/I3': i3,
				'B2/I4': i4,
				'B2/B3': b3,
				'B2/B3/I5': i5,
			});
		});
	});
});
