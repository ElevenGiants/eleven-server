var util = require('util');
var rewire = require('rewire');
var gsjsBridge = rewire('model/gsjsBridge');
var Item = require('model/Item');


suite('gsjsBridge', function() {

	suite('createFromData', function() {
	
		function createDummyProtos() {
			var ret = {
				items: {},
			};
			var Thingie = function Thingie() {
				Thingie.super_.apply(this, arguments);
				this.dummydata = 'foo';
			};
			util.inherits(Thingie, Item);
			ret.items.thingie = Thingie.prototype;
			return ret;
		};
		
		setup(function() {
			gsjsBridge.__set__('prototypes', createDummyProtos());
		});
		
		test('does its job', function() {
			var o = gsjsBridge.createFromData({
				tsid: 'IXYZ',
				class_tsid: 'thingie',
				blargh: 'oomph',
			});
			assert.strictEqual(o.constructor.name, 'Thingie');
			assert.instanceOf(o, Item);
			assert.strictEqual(o.tsid, 'IXYZ');
			assert.property(o, 'blargh', 'property copied from supplied data');
			assert.property(o, 'dummydata', 'property set in thingie constructor');
		});
		
		test('geometry and DC objects are instantiated directly from GameObject', function() {
			var o = gsjsBridge.createFromData({tsid: 'GXYZ'});
			assert.strictEqual(o.constructor.name, 'GameObject');
			var o = gsjsBridge.createFromData({tsid: 'DXYZ'});
			assert.strictEqual(o.constructor.name, 'GameObject');
		});
	});
});
