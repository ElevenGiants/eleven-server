'use strict';

var gsjsBridge = require('model/gsjsBridge');
var RC = require('data/RequestContext');
var Geo = require('model/Geo');
var Location = require('model/Location');
var Quest = require('model/Quest');
var pers = require('data/pers');
var utils = require('utils');
var pbeMock = require('../../mock/pbe');


suite('Quest', function () {

	setup(function () {
		gsjsBridge.reset();
		pers.init(pbeMock);
	});

	teardown(function () {
		gsjsBridge.reset();
		pers.init();  // disable mock back-end
	});


	suite('ctor', function () {

		test('does not override changed prototype properties', function () {
			/*jshint -W055 */  // deliberate lowercase constructor name here
			var ctor = gsjsBridge.getProto('quests', 'lightgreenthumb_1').constructor;
			var q = new ctor({accepted: true, class_tsid: 'lightgreenthumb_1'});
			assert.strictEqual(q.accepted, true);
			/*jshint +W055 */
		});
	});


	suite('create', function () {

		test('does its job', function (done) {
			new RC().run(
				function () {
					var l = Location.create(Geo.create());
					var q = Quest.create('beer_guzzle', l);
					assert.isTrue(utils.isQuest(q));
					assert.strictEqual(q.class_tsid, 'beer_guzzle');
					assert.strictEqual(q.owner, l);
				},
				function cb(err, res) {
					if (err) return done(err);
					var db = pbeMock.getDB();
					assert.strictEqual(pbeMock.getCounts().write, 3);
					assert.strictEqual(Object.keys(db).length, 3);
					return done();
				}
			);
		});

		test('fails on invalid owner type', function () {
			assert.throw(function () {
				new RC().run(function () {
					var geo = Geo.create();
					Quest.create('beer_guzzle', geo);
				});
			}, assert.AssertionError);
		});
	});


	suite('del', function () {

		test('flags owner/quest DCs as dirty', function (done) {
			var db = pbeMock.getDB();
			db.G1 = {
				tsid: 'G1',
			};
			db.L1 = {
				tsid: 'L1',
				players: ['P1'],
				jobs: {
					'proto-IDOOR': {
						class_ids: {
							job_proto_door: {
								class_id: 'job_proto_door',
								label:  'Build a New Floor',
								instance: {objref: true, tsid: 'Q2'},
							},
						},
					},
				},
			};
			db.P1 = {
				tsid: 'P1',
				label: 'a player',
				location: {objref: true, tsid: 'L1'},
				quests: {
					todo: {objref: true, label: 'To Do', tsid: 'D1'},
					done: {objref: true, label: 'Done', tsid: 'D2'},
				},
			};
			db.D1 = {
				tsid: 'D1',
				owner: {objref: true, label: 'a player', tsid: 'P1'},
				quests: {
					beer_guzzle: {objref: true, tsid: 'Q1'},
				},
			};
			db.D2 = {
				tsid: 'D2',
				owner: {objref: true, label: 'a player', tsid: 'P1'},
				quests: {},
			};
			db.Q1 = {
				tsid: 'Q1',
				owner: {objref: true, label: 'a player', tsid: 'P1'},
				class_tsid: 'beer_guzzle',
			};
			db.Q2 = {
				tsid: 'Q2',
				owner: {objref: true, label: 'a player\'s house', tsid: 'L1'},
				class_tsid: 'job_proto_door',
			};
			new RC().run(
				function () {
					pers.get('P1').quests.todo.quests.beer_guzzle.del();
					var locJobs = pers.get('L1').jobs['proto-IDOOR'].class_ids;
					locJobs.job_proto_door.instance.del();
				},
				function cb(err) {
					if (err) return done(err);
					assert.sameMembers(pbeMock.getDeletes(), ['Q1', 'Q2']);
					assert.includeMembers(pbeMock.getWrites(), ['D1', 'L1']);
					return done();
				}
			);
		});
	});
});
