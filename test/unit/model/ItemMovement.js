'use strict';

var Geo = require('model/Geo');
var Item = require('model/Item');
var ItemMovement = require('model/ItemMovement');


suite('ItemMovement', function () {

	suite('buildPath', function () {

		function getTestGeo() {
			var geo = new Geo({l: -100, r: 100, t: -100, b: 0});
			geo.layers.middleground.platform_lines = {
				plat1: {
					start: {x: -100, y: -10},
					end: {x: 100, y: -10},
					platform_item_perm: -1,
					platform_pc_perm: -1,
				},
			};
			return geo;
		}

		test('keeps path within geo limits for "kicked" transport', function () {
			var geo = getTestGeo();
			var it = new Item();
			it.container = {geometry: geo};
			it.x = 90;
			it.y = -20;
			var im = new ItemMovement(it);
			im.options = {vx: 20, vy: -30};
			var path = im.buildPath('kicked');
			for (var i = 0; i < path.length; i++) {
				var segment = path[i];
				assert.isTrue(segment.x >= geo.l && segment.x <= geo.r,
					'path segment ends within horizontal geo boundaries');
				assert.isTrue(segment.y >= geo.t && segment.y <= geo.b,
					'path segment ends within vertical geo boundaries');
			}
		});
	});
});
