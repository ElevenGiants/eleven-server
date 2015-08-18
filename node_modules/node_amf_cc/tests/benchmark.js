/*
 * Benchmark node_amf_cc against amflib.
 */

var suite = new (require('benchmark')).Suite;  // npm install benchmark
var SegfaultHandler = require('segfault-handler');
var sys = require('sys');
var fs = require('fs');

var amfcc = require('../build/Release/node_amf_cc');
var amflib = require('amflib/node-amf/amf');  // npm install amflib

SegfaultHandler.registerHandler();

// load test fixtures
var amfData = {};
[
  'in-move_xy',
  'in-edit_location',
  'out-location_lock_request',
  'out-login_start',
].forEach(function iter(type) {
  amfData[type] = fs.readFileSync('tests/data/amfmsg-' + type + '.bin');
});
var jsonData = {};
[
  'out-ping',
  'out-login_end',
  'out-map_get',
  'out-login_start',
].forEach(function iter(type) {
  jsonData[type] = JSON.parse(fs.readFileSync('tests/data/jsonmsg-' + type + '.json'));
});

var deserializers = {
  'amflib': function(x) { return amflib.deserializer(x.toString('binary')).readValue(amflib.AMF3); },
  
  'amfcc': function(x) { return amfcc.deserialize(x.toString('binary')).value; },
};

Object.keys(deserializers).forEach(function (libname) {
  Object.keys(amfData).forEach(function (type) {
    // Debug what's working
    //console.log((deserializers[libname])(amfData[type]));
  });
  suite.add(libname + '/deserialize', function() {
    Object.keys(amfData).forEach(function (type) {
      (deserializers[libname])(amfData[type]);
    });
  });
}); 

var serializers = {
  'amflib': function(x) { return amflib.serializer().writeObject(x); },
  'amfcc': function(x) { return amfcc.serialize(x); }
};

Object.keys(serializers).forEach(function (libname) {
  suite.add(libname + '/serialize', function() {
    Object.keys(jsonData).forEach(function (type) {
      (serializers[libname])(jsonData[type]);
    });
  });
});


suite.on('complete', function() {
  console.log(this.join('\n'));
  console.log('Fastest is ' + this.filter('fastest').pluck('name'));
})

suite.run();
