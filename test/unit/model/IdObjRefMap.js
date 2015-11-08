'use strict';

var IdObjRefMap = require('model/IdObjRefMap');


suite('IdObjRefMap', function () {

	suite('ctor', function () {

		test('creates empty IdObjRefMap without parameter', function () {
			var oh = new IdObjRefMap();
			assert.strictEqual(oh.length, 0);
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
			var iorm = new IdObjRefMap([
				{tsid: 'x', class_tsid: 'cx'},
				{tsid: 'y', class_tsid: 'cy'},
				{tsid: 'z'},
			]);
			var visited = [];
			iorm.apiIterate(function (o) {
				visited.push(o.tsid);
			});
			assert.sameMembers(visited, ['x', 'y', 'z']);
		});

		test('works with class_tsid parameter', function () {
			var iorm = new IdObjRefMap([
				{tsid: 'w', class_tsid: 'cx'},
				{tsid: 'x', class_tsid: 'cx'},
				{tsid: 'y', class_tsid: 'cy'},
				{tsid: 'z'},
			]);
			var visited = [];
			iorm.apiIterate('cx', function (o) {
				visited.push(o.tsid);
			});
			assert.sameMembers(visited, ['w', 'x']);
		});
	});
});
