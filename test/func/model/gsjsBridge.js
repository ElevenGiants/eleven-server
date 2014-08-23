'use strict';

var rewire = require('rewire');
var gsjsBridge = rewire('model/gsjsBridge');
var Bag = require('model/Bag');
var GameObject = require('model/GameObject');
var Item = require('model/Item');


suite('gsjsBridge', function() {
	
	setup(function() {
		// reset prototype cache
		gsjsBridge.reset();
		// reset node module cache
		for (var key in require.cache) {
			delete require.cache[key];
		}
	});
	
	
	suite('prototype cache initialization', function() {
	
		this.timeout(60000);
		this.slow(60000);
		
		test('does the job', function(done) {
			gsjsBridge.init(function(err) {
				var protos = gsjsBridge.__get__('prototypes');
				// these numbers should be adjusted after GSJS changes, obviously:
				assert.isTrue(Object.keys(protos.achievements).length >= 664);
				assert.isTrue(Object.keys(protos.groups).length >= 13);
				assert.isTrue(Object.keys(protos.items).length >= 1286);
				assert.isTrue(Object.keys(protos.locations).length >= 20);
				assert.isTrue(Object.keys(protos.players).length >= 4);
				assert.isTrue(Object.keys(protos.quests).length >= 448);
				done(err);
			});
		});
		
		test('does not block, works even when single prototypes are loaded in between', function(done) {
			var time = new Date().getTime();
			var pi = null;
			gsjsBridge.init(function(err) {
				assert.isNotNull(pi);
				done(err);
			});
			pi = gsjsBridge.getProto('items', 'pi');
			time = new Date().getTime() - time;
			assert.isTrue(time < 1000, 'too slow: ' + time + ' ms');
		});
	});
	
	
	suite('prototype loading and composition', function() {
		
		this.timeout(10000);
		this.slow(4000);
		
		test('prototypes inherit from respective model/base classes', function() {
			var Pi = gsjsBridge.getProto('items', 'pi').constructor;
			var pi = new Pi();
			assert.instanceOf(pi, Item);
			assert.instanceOf(pi, GameObject);
			assert.property(pi, 'estimateDigit', 'pi-specific property');
			assert.property(pi, 'distanceFromPlayer', 'property from item.js');
			assert.property(pi, 'is_food', 'property from include/food.js');
			var bag = gsjsBridge.create('items', 'bag_bigger');
			assert.instanceOf(bag, Bag);
			assert.instanceOf(bag, Item);
			assert.instanceOf(bag, GameObject);
			assert.property(bag, 'firstEmptySlot', 'property from bag.js');
		});
		
		test('constructor name is class_tsid', function() {
			var proto = gsjsBridge.getProto('players', 'human');
			assert.strictEqual(proto.constructor.name, 'human');
			proto = gsjsBridge.getProto('achievements', '1star_cuisinartist');
			assert.strictEqual(proto.constructor.name, '_1star_cuisinartist',
				'names starting with a digit (invalid JS identifier) are prefixed with an underscore');
		});
		
		test('base classes are loaded too', function() {
			assert.isDefined(gsjsBridge.getProto('items', 'item'));
			assert.isDefined(gsjsBridge.getProto('quests', 'quest'));
		});
	});
});
