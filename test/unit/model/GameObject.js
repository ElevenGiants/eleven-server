'use strict';

var GameObject = require('model/GameObject');


suite('GameObject', function () {

	suite('ctor', function () {

		test('can instantiate new objects from scratch', function () {
			var go = new GameObject();
			assert.isString(go.tsid);
			assert.strictEqual(go.tsid[0], 'G');
			assert.isDefined(go.ts);
		});

		test('can instantiate new objects from existing data', function () {
			var go = new GameObject({
				tsid: 'GXYZ',
				class_tsid: 'something',
			});
			assert.strictEqual(go.tsid, 'GXYZ');
			assert.strictEqual(go.class_tsid, 'something');
			assert.strictEqual(go.id, 'GXYZ', 'deprecated property "id"');
			assert.strictEqual(go.class_id, 'something',
				'deprecated property "class_id"');
		});

		test('can instantiate with deprecated ID properties', function () {
			var go = new GameObject({
				id: 'GXYZ',
				class_id: 'something',
			});
			assert.strictEqual(go.tsid, 'GXYZ');
			assert.strictEqual(go.class_tsid, 'something');
		});
	});


	suite('serialize', function () {

		test('skips properties prefixed with "!"', function () {
			var go = new GameObject({
				tsid: 'GXYZ',
				'!excluded': 'x',
			});
			var ser = go.serialize();
			assert.strictEqual(ser.tsid, 'GXYZ');
			assert.notProperty(ser, '!excluded');
		});

		test('does not include function type properties', function () {
			var ser = new GameObject().serialize();
			assert.notProperty(ser, 'serialize');
		});

		test('returns data suitable to instantiate the object again', function () {
			var go = new GameObject({
				tsid: 'GXYZ',
			});
			go = new GameObject(go.serialize());
			assert.strictEqual(go.tsid, 'GXYZ');
		});

		test('does not include deprecated ID properties', function () {
			var go = new GameObject({
				id: 'GXYZ',
				class_id: 'something',
			});
			var ser = go.serialize();
			assert.strictEqual(ser.tsid, 'GXYZ');
			assert.strictEqual(ser.class_tsid, 'something');
			assert.notProperty(ser, 'id');
			assert.notProperty(ser, 'class_id');
		});
	});


	suite('del', function () {

		test('flags object for deletion', function () {
			var go = new GameObject();
			assert.property(go, 'deleted');
			assert.isFalse(go.deleted);
			go.del();
			assert.isTrue(go.deleted);
		});
	});
});
