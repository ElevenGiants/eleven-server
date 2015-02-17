'use strict';

require('../../setup');
var suite = new (require('benchmark')).Suite;
module.exports = suite;
var childproc = require('child_process');
var path = require('path');
var rewire = require('rewire');
var rpc = rewire('data/rpc');
var config = require('config');
var wait = require('wait.for');
var GameObject = require('model/GameObject');


// minimal GS configuration with one master and one worker process
var CONFIG = {net: {
	gameServers: {
		gs01: {host: '127.0.0.1', ports: [3000]},
	},
	rpc: {basePort: 6000, timeout: 10000},
}};
// dummy game object to call RPC functions on
var DUMMY_OBJ = new GameObject({
	tsid: 'LTESTOBJECT',
	add: function(a, b) { return a + b; },
});


var worker;


// called by the bench runner (i.e. only for the master process)
suite.asyncSetup = function(done) {
	// fork child process as worker/RPC server
	worker = childproc.fork(path.join(__filename));
	worker.send({cmd: 'init'});
	worker.on('message', function messageHandler() {
		// server is ready, initialize config and RPC channels for
		// ourself (master, RPC client)
		init(true, function masterReady() {
			done();
		});
	});
};


// message handler for the (worker/RPC client) child process
process.on('message', function(msg) {
	switch(msg.cmd) {
		case 'init':
			init(false);
			break;
		case 'shutdown':
			rpc.shutdown(function callback() {
				process.exit(0);
			});
			break;
	}
});


// initializes the process either as master (RPC client for the purpose of
// this benchmark) or worker (RPC server, started as a child process)
function init(isMaster, ready) {
	config.init(isMaster, CONFIG, isMaster ? {} : {gsid: 'gs01-01'});
	// mock the persistence layer (dirty as fuck, but we're only messing up
	// the rpc module for this particular process here)
	rpc.__set__('pers', {
		get: function() {
			return DUMMY_OBJ;
		},
	});
	// initialize RPC channels
	rpc.init(function callback(err) {
		if (err) throw err;
		if (isMaster) {
			// master -> start benchmark
			ready();
		}
		else {
			// worker -> signal parent process (benchmark suite) that we're ready
			process.send({type: 'ready'});
		}
	});
}


// cleanup/shutdown handler
suite.on('complete', function() {
	rpc.shutdown(function callback() {
		worker.send({cmd: 'shutdown'});
	});
});


suite.add('game object function call (w/ wait.for)', function(deferred) {
	wait.launchFiber(function rpcFiber() {
		rpc.sendObjRequest(DUMMY_OBJ, 'add', [1, 2]);
		deferred.resolve();
	});
}, {defer: true});


suite.add('game object function call (w/ callback)', function(deferred) {
	rpc.sendObjRequest(DUMMY_OBJ, 'add', [1, 2], function(err, res) {
		if (err) throw err;
		deferred.resolve();
	});
}, {defer: true});
