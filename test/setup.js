'use strict';

var bunyan = require('bunyan');
var chai = require('chai');
var config = require('config');


initGlobals();
initConfig();


function initGlobals() {
	global.assert = chai.assert;
	global.log = bunyan.createLogger({
		name: 'testlog',
		src: true,
		streams: [
			{
				level: 'fatal',
				stream: process.stderr,
			},
		],
	});
}


function initConfig() {
	// minimal configuration just to enable tests
	config.init(true, {
		net: {
			gameServers: {
				gs01: {
					host: '127.0.0.1',
					ports: [1443],
				},
			},
		},
		gsjs: {
			config: 'config_prod',
		},
	}, {});
}
