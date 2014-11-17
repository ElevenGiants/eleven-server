'use strict';

require('../setup');
var suite = new (require('benchmark')).Suite;
module.exports = suite;


var fs = require('fs');
var amflib = require('node_amf_cc');


// load test fixtures
var amfData = {};
var amfDataStr = {};
[
	'in-move_xy',
	'in-edit_location',
	'out-location_lock_request',
	'out-login_start',
].forEach(function iter(type) {
	amfData[type] = fs.readFileSync('bench/fixtures/amfmsg-' + type + '.bin');
	amfDataStr[type] = amfData[type].toString('binary');
});
var jsonData = {};
[
	'out-ping',
	'out-login_end',
	'out-map_get',
	'out-login_start',
].forEach(function iter(type) {
	jsonData[type] = JSON.parse(fs.readFileSync('bench/fixtures/jsonmsg-' + type + '.json'));
});


Object.keys(amfData).forEach(function iter(type) {
	suite.add('amflib/deserialize ' + type, function () {
		amflib.deserialize(amfDataStr[type]);
	});
});


Object.keys(jsonData).forEach(function iter(type) {
	suite.add('amflib/serialize ' + type, function () {
		//amflib.serialize(jsonData[type]);
		// JSON dance to be more realistic for the time being - see proxy
		// workaround in comm.Session.prototype.send
		amflib.serialize(JSON.parse(JSON.stringify(jsonData[type])));
	});
});
