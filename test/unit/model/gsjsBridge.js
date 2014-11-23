'use strict';

var util = require('util');
var rewire = require('rewire');
var gsjsBridge = rewire('model/gsjsBridge');
var Item = require('model/Item');
var Geo = require('model/Geo');
var DataContainer = require('model/DataContainer');


suite('gsjsBridge', function () {

	suite('create', function () {

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
		}

		setup(function () {
			gsjsBridge.__set__('prototypes', createDummyProtos());
		});

		test('does its job', function () {
			var o = gsjsBridge.create({
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

		test('geo and DC objects are instantiated from their base classes', function () {
			var g = gsjsBridge.create({tsid: 'GXYZ'});
			assert.instanceOf(g, Geo);
			var d = gsjsBridge.create({tsid: 'DXYZ'});
			assert.instanceOf(d, DataContainer);
		});
	});


	suite('isTsid', function () {

		test('works as expected', function () {
			assert.isTrue(gsjsBridge.isTsid('PXYZ'));
			assert.isTrue(gsjsBridge.isTsid('IA'));
			assert.isFalse(gsjsBridge.isTsid('pXYZ'));
			assert.isFalse(gsjsBridge.isTsid('FOO'));
			assert.isFalse(gsjsBridge.isTsid(null));
			assert.isFalse(gsjsBridge.isTsid(undefined));
			assert.isFalse(gsjsBridge.isTsid(''));
		});
	});


	suite('getConfig', function () {

		setup(function () {
			gsjsBridge.init(true);
		});

		teardown(function () {
			gsjsBridge.reset();
		});


		test('works as expected', function () {
			gsjsBridge.__get__('initDependencies')({dummy: 'config'}, {});
			assert.strictEqual(gsjsBridge.getConfig().dummy, 'config');
		});
	});
});
