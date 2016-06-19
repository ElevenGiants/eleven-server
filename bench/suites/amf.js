'use strict';

require('../setup');
var suite = new (require('benchmark')).Suite;
module.exports = suite;


var fs = require('fs');
var amf = {
	js: require('eleven-node-amf/node-amf/amf'),
	cc: require('node_amf_cc'),
};


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
	suite.add('amflib-js/deserialize ' + type, function () {
		var deser = amf.js.deserializer(amfDataStr[type]);
		deser.readValue(amf.js.AMF3);
	});
	suite.add('amflib-cc/deserialize ' + type, function () {
		amf.cc.deserialize(amfDataStr[type]);
	});
});


Object.keys(jsonData).forEach(function iter(type) {
	suite.add('amflib-js/serialize ' + type, function () {
		amf.js.serializer().writeObject(jsonData[type]);
	});
	suite.add('amflib-cc/serialize ' + type, function () {
		amf.cc.serialize(jsonData[type]);
	});
});
