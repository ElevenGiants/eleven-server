'use strict';

var rewire = require('rewire');
var RC = rewire('data/RequestContext');
var persMock = require('../../mock/pers');


suite('RequestContext', function () {

	setup(function () {
		RC.__set__('pers', persMock);
		persMock.reset();
	});

	teardown(function () {
		RC.__set__('pers', rewire('data/pers'));
	});


	suite('run', function () {

		test('rolls back tainted objects when request has failed', function (done) {
			new RC().run(
				function () {
					var rc = RC.getContext();
					rc.setDirty({tsid: 'IA'});
					rc.setDirty({tsid: 'IB', deleted: true});
					assert.deepEqual(Object.keys(rc.dirty), ['IA', 'IB']);
					throw 'foo';
				},
				function callback(err) {
					assert.strictEqual(err, 'foo');
					assert.deepEqual(Object.keys(persMock.getUnloadList()),
						['IA', 'IB']);
					assert.deepEqual(persMock.getDirtyList(), {});
					done();
				}
			);
		});
	});
});
