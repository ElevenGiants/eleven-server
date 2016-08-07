'use strict';

/**
 * Simplistic game server benchmark script; creates a number of dummy
 * players, logs them in and continuously moves them around with random
 * coordinates (within their location).
 *
 * Start it like this:
 *   node tools/bench.js | bunyan
 *
 * CAVEATS:
 * * Currently requires the GS to be configured with a single worker
 *   process and the "passthrough" authentication back-end.
 */

/* eslint-disable func-names */

var _ = require('lodash');
var amf = require('../node_modules/node_amf_cc');
var jrpc = require('../node_modules/multitransport-jsonrpc');
var events = require('events');
var net = require('net');
var util = require('util');


var GS_AMFHOST = '192.168.23.23';
var GS_AMFPORT = 1443;
var GS_RPCHOST = '192.168.23.23';
var GS_RPCPORT = 6001;
var NUM_CLIENTS = 5;
var MOVE_IMMEDIATELY = false;

var log = require('bunyan').createLogger({name: 'bench', level: 'info'});
var rpc;
var clients = [];


process.on('uncaughtException', function (err) {
	log.error(err, 'UNCAUGHT EXCEPTION');
});


util.inherits(Client, events.EventEmitter);
function Client(num, tsid) {
	this.num = num;
	this.tsid = tsid;
	this.socket = net.connect(GS_AMFPORT, GS_AMFHOST);
	this.msg_id = 1;
	this.socket.on('data', this.onData.bind(this));
	this.socket.on('end', this.onEnd.bind(this));
	this.socket.on('timeout', this.onTimeout.bind(this));
	this.socket.on('drain', this.onDrain.bind(this));
	this.socket.on('error', this.onError.bind(this));
	this.socket.on('close', this.onClose.bind(this));
}


Client.prototype.toString = function () {
	return '[client#' + this.num + '|' + this.tsid + ']';
};


Client.prototype.send = function (msg) {
	msg.msg_id = this.msg_id++;
	msg = JSON.parse(JSON.stringify(msg));
	var data = amf.serialize(msg);
	var self = this;
	process.nextTick(function () {
		self.on(msg.msg_id, getProfilingCallback(msg.type, process.hrtime()));
		self.socket.write(new Buffer(data, 'binary'));
		log.debug('%s sent %s request (id#%s)', self, msg.type, msg.msg_id);
	});
	return msg.msg_id;
};


Client.prototype.request = function (typeOrMsg, callback) {
	var msg = typeOrMsg;
	if (_.isString(msg)) {
		msg = {type: msg};
	}
	var id = this.send(msg);
	if (callback) {
		this.on(id, callback);
	}
};


function getProfilingCallback(reqType, startTime) {
	return function () {
		var diff = process.hrtime(startTime);
		log.debug('%s request took %s ms', reqType,
			diff[0] * 1000 + Math.round(diff[1] / 1e6));
	};
}


Client.prototype.onData = function (data) {
	log.debug('onData (%s bytes)', data.length);
	if (this.buffer === undefined) {
		// not currently receiving a message -> must be a new one
		this.msgSize = data.readInt32BE(0);
		this.buffer = new Buffer(this.msgSize);
		this.bufferIndex = 0;
		// if we already have payload data, make sure we handle it
		if (data.length > 4) {
			data = data.slice(4);
		}
		else {
			return;  // nothing more to do right now
		}
	}
	// add payload data chunk to buffer
	data.copy(this.buffer, this.bufferIndex, 0, Math.min(data.length,
		this.buffer.length - this.bufferIndex));
	this.bufferIndex += data.length;
	// handle fully received message if applicable
	if (this.bufferIndex >= this.msgSize) {
		var msg = this.buffer;
		var self = this;
		process.nextTick(function () {
			self.onMessage(msg);
		});
		// prepare for next message
		delete this.buffer;
		if (this.bufferIndex > this.msgSize) {
			// already received part of next message -> handle it
			this.onData(data.slice(this.msgSize));
		}
	}
};


Client.prototype.onMessage = function (msgBuf) {
	log.trace('onMessage (%s bytes)', msgBuf.length);
	var deser = amf.deserialize(msgBuf.toString('binary'));
	var data = deser.value;
	log.debug('%s received %s %s', this, data.type,
		data.msg_id ? 'response (id#' + data.msg_id + ')' : 'message');
	if (data.msg_id) {
		this.emit(data.msg_id, data);
	}
	if (data.type) {
		this.emit(data.type, data);
	}
};


Client.prototype.onEnd = function () {
	log.info('onEnd');
};


Client.prototype.onTimeout = function () {
	log.warning('onTimeout');
};


Client.prototype.onDrain = function () {
	log.warning('onDrain');
};


Client.prototype.onError = function (err) {
	log.error('onError(%s)', err);
};


Client.prototype.onClose = function (hadError) {
	log.info('onClose(%s)', hadError);
};


Client.prototype.login = function (callback) {
	var self = this;
	self.request({type: 'login_start', token: this.tsid}, function (res) {
		self.request('login_end', function (res) {
			log.info('%s logged in', this);
			callback(null, res);
		});
	});
};


Client.prototype.moveRandomly = function () {
	log.info('starting movement for %s', this);
	var self = this;
	setInterval(function () {
		self.request({
			type: 'move_xy',
			x: Math.ceil(Math.random() * 1000),
			y: Math.ceil(Math.random() * 1000),
		});
	}, 100);
};


function createPlayer(num, name, callback) {
	rpc.gs('BENCH_DRIVER', 'createPlayer', [num, name], function cb(err, tsid) {
		if (err) return callback(err);
		log.info('created player for client %s: %s', num, tsid);
		return callback(null, new Client(num, tsid));
	});
}


function initClients(done) {
	var i = clients.length;
	createPlayer('' + i, 'bencho' + i, function (err, client) {
		if (err) throw err;
		clients.push(client);
		client.login(function (err, res) {
			if (err) throw err;
			if (MOVE_IMMEDIATELY) client.moveRandomly();
			if (clients.length < NUM_CLIENTS) initClients(done);
			else return done();
		});
	});
}


// main
if (!module.parent) {

	rpc = new jrpc.client(new jrpc.transports.client.tcp(GS_RPCHOST, GS_RPCPORT));
	rpc.register(['obj', 'api', 'admin', 'gs']);

	initClients(function done() {
		if (!MOVE_IMMEDIATELY) {
			clients.forEach(function (client, i) {
				setTimeout(function startMovement() {
					client.moveRandomly();
				}, i * 10000);
			});
		}
	});
}
/* eslint-enable func-names */
