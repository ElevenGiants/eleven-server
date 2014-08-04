var util = require('util');
var Bag = require('model/Bag');
var Item = require('model/Item');


suite('Bag', function() {

	suite('ctor', function() {
	
		test('initializes items and hiddenItems properties', function() {
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
	

	suite('serialize', function() {
	
		test('works as expected', function() {
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
});
