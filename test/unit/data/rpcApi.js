'use strict';

var rewire = require('rewire');
var auth = require('comm/auth');
var abePassthrough = require('comm/abe/passthrough');
var rpc = rewire('data/rpc');
var rpcApi = rewire('data/rpcApi');
var pers = require('data/pers');
var persMock = require('../../mock/pers');
var Player = require('model/Player');
var Location = require('model/Location');
var Geo = require('model/Geo');

// introduce rewired components to each other
rpcApi.__set__('rpc', rpc);


suite('rpcApi', function () {

	setup(function () {
		rpc.__set__('pers', persMock);
		rpcApi.__set__('pers', persMock);
		persMock.reset();
	});

	teardown(function () {
		persMock.reset();
		rpcApi.__set__('pers', pers);
		rpc.__set__('pers', pers);
	});


	suite('getConnectData', function () {

		setup(function () {
			auth.init(abePassthrough);
		});

		teardown(function () {
			auth.init(null);
		});


		test('does its job', function () {
			var l = new Location({tsid: 'L1'}, new Geo());
			persMock.preAdd(new Player({tsid: 'PXYZ', location: l}), l);
			var data = rpcApi.getConnectData('PXYZ');
			assert.deepEqual(data, {
				hostPort: '127.0.0.1:1443',  // from standard test config (setup.js)
				authToken: 'PXYZ',
			});
		});
	});
});
