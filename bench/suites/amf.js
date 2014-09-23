'use strict';

require('../setup');
var suite = new (require('benchmark')).Suite;
module.exports = suite;


var fs = require('fs');
var amflib = require('amflib/node-amf/amf');


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
		var deser = amflib.deserializer(amfDataStr[type]);
		deser.readValue(amflib.AMF3);
	});
});


Object.keys(jsonData).forEach(function iter(type) {
	suite.add('amflib/serialize ' + type, function () {
		amflib.serializer().writeObject(jsonData[type]);
	});
});
