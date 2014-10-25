'use strict';

var IdObjRefMap = require('model/IdObjRefMap');


suite('IdObjRefMap', function () {

	suite('ctor', function () {

		test('creates empty IdObjRefMap without parameter', function () {
			var oh = new IdObjRefMap();
			assert.strictEqual(oh.length, 0);
		});

		test('JSON serialization skips everything but data properties', function () {
			var iorm = new IdObjRefMap({x: 'x', y: {z: 'z'}});
			assert.strictEqual(JSON.stringify(iorm),
				'{"x":"x","y":{"z":"z"}}');
		});
	});


	suite('length', function () {

		test('does its job', function () {
			var iorm = new IdObjRefMap();
			assert.strictEqual(iorm.length, 0);
			iorm.x = 'x';
			assert.strictEqual(iorm.length, 1);
			iorm.y = {y: 'y', z: 'z'};
			assert.strictEqual(iorm.length, 2);
			iorm.u = undefined;
			assert.strictEqual(iorm.length, 3);
			delete iorm.x;
			assert.strictEqual(iorm.length, 2);
		});
	});


	suite('apiIterate', function () {

		test('works without class_tsid parameter', function () {
			var iorm = new IdObjRefMap({
				x: {id: 'x', class_tsid: 'cx'},
				y: {id: 'y', class_tsid: 'cy'},
				z: {id: 'z'},
			});
			var visited = [];
			iorm.apiIterate(function (o) {
				visited.push(o.id);
			});
			assert.sameMembers(visited, ['x', 'y', 'z']);
		});

		test('works with class_tsid parameter', function () {
			var iorm = new IdObjRefMap({
				w: {id: 'w', class_tsid: 'cx'},
				x: {id: 'x', class_tsid: 'cx'},
				y: {id: 'y', class_tsid: 'cy'},
				z: {id: 'z'},
			});
			var visited = [];
			iorm.apiIterate('cx', function (o) {
				visited.push(o.id);
			});
			assert.sameMembers(visited, ['w', 'x']);
		});
	});
});
