var GameObject = require('model/GameObject');


suite('GameObject', function() {

	suite('ctor', function() {
	
		test('can instantiate new objects from scratch', function() {
			var go = new GameObject();
			assert.isString(go.tsid);
			assert.strictEqual(go.tsid[0], 'G');
			assert.isDefined(go.ts);
		});
	
		test('can instantiate new objects from existing data', function() {
			var go = new GameObject({
				tsid: 'GXYZ',
				class_id: 'something',
			});
			assert.strictEqual(go.tsid, 'GXYZ');
			assert.strictEqual(go.class_tsid, 'something');
		});
		
	});
	
	
	suite('serialize', function() {
	
		test('skips properties prefixed with "!"', function() {
			var go = new GameObject({
				tsid: 'GXYZ',
				'!excluded': 'x',
			});
			var ser = go.serialize();
			assert.strictEqual(ser.tsid, 'GXYZ');
			assert.notProperty(ser, '!excluded');
		});
		
		test('does not include function type properties', function() {
			var ser = new GameObject().serialize();
			assert.notProperty(ser, 'serialize');
		});
		
		test('returns data suitable to instantiate the object again', function() {
			var go = new GameObject({
				tsid: 'GXYZ',
			});
			go = new GameObject(go.serialize());
			assert.strictEqual(go.tsid, 'GXYZ');
		});
	});
});
