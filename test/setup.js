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
	config.init(false, {
		net: {
			gameServers: {
				gs01: {
					host: '127.0.0.1',
					ports: [1443],
				},
			},
			maxMsgSize: 131072,
			rpc: {
				timeout: 10000,
			},
		},
		pers: {
			backEnd: {
				config: {
					rethink: {
						dbname: 'eleven_test',
						dbhost: 'localhost',
						dbport: 28015,
						dbauth: 'test123',
						queryOpts: {
							durability: 'hard',
							noreply: false,
						},
					},
				},
			},
		},
		gsjs: {
			config: 'config_prod',
		},
	}, {
		gsid: 'gs01-01',
	});
}
