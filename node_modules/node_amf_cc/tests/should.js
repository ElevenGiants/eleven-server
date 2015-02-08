/**
 * Unittests for node_amf_cc module.
 */

var should = require('should');
var sys = require('sys'); 
var amfcc = require('../build/Release/node_amf_cc');

var amflib = require('amflib/node-amf/amf');  // npm install amflib
var Reflect = require('harmony-reflect');

var proxy = new Proxy(
{"type":"physics_changes","adjustments":{"keys":{"imagination":{"added_time":1342669406577,"can_3_jump":1,"can_wall_jump":0,"gravity":1,"is_img":1,"is_permanent":1,"multiplier_3_jump":0.8,"vx_max":1,"vy_jump":1}},"can_3_jump":true,"vx_max":1,"vy_max":1,"gravity":1,"vy_jump":1,"vx_accel_add_in_floor":1,"vx_accel_add_in_air":1,"friction_floor":1,"friction_air":1,"friction_thresh":1,"vx_off_ladder":1,"pc_scale":1,"item_scale":1,"y_cam_offset":1,"multiplier_3_jump":0.8}}
, { "type": "bar", "foo" : 3 } );

// data types to test with human-readable description
var tests = [
  // strings
  ['empty string', ''],
  ['ascii string', 'Hello World'],
  ['unicode string', '£今\u4ECA"\u65E5日'],
  // numbers
  ['zero',  0 ],
  ['integer in 1 byte u29 range', 0x7F ],
  ['integer in 2 byte u29 range', 0x00003FFF ],
  ['integer in 3 byte u29 range', 0x001FFFFF ],
  ['integer in 4 byte u29 range', 0x1FFFFFFF ],
  ['large integer', 4294967296 ],
  ['large negative integer', -4294967296 ],
  ['small negative integer', -1 ],
  ['med negative integer', -232 ],
  ['med positive integer', 536870680 ],
  ['small floating point', 0.123456789 ],
  ['small negative floating point', -0.987654321 ],
  ['Number.MIN_VALUE', Number.MIN_VALUE ],
  ['Number.MAX_VALUE',  Number.MAX_VALUE ],
  ['Number.NaN', Number.NaN],
  // other scalars
  ['Boolean false', false],
  ['Boolean true', true ],
  ['undefined', undefined ],
  ['null', null],
  // Arrays
  ['empty array', [] ],
  ['mixed array', [ 1, 'ab', true ] ],
  ['integer array', [ 1, -1, 2, -2, 3, -3, 4, -4, 5, -5 ] ],
  ['string array', [ 'foo', 'foo', 'foo' ] ],
  ['sparse array', [undefined,undefined,undefined,undefined,undefined,undefined] ],
  ['multi-dimensional array',  [[[],[]],[],] ],
  // special objects
  ['date object (epoch)', new Date(0) ],
  ['date object (now)', new Date() ],
  // plain objects
  ['empty object', {} ],
  ['keyed object', { foo:'bar', 'foo bar':'baz' } ],
  ['int keyed object', { "0":'bar', 1:'baz' } ],
  ['refs object', { foo: _ = { a: 12 }, bar: _ } ],
  ['glitch object', { msg_id: '8', location: { r: 3000, tsid: 'LLIER' } } ],
  ['glitch ping', {"type":"ping","success":true,"ts":1411415614} ],
  ['glitch deco_visibility', { type: 'deco_visibility', visible: false, deco_name: 'firebog_light_pool_1352760858568', fade_ms: true }],
  ['glitch ping undefined', { msg_id: undefined, type: 'ping', success: true, ts: 1415740048 }],
  ['glitch physics changes', {"type":"physics_changes","adjustments":{"keys":{"imagination":{"added_time":1342669406577,"can_3_jump":1,"can_wall_jump":0,"gravity":1,"is_img":1,"is_permanent":1,"multiplier_3_jump":0.8,"vx_max":1,"vy_jump":1}},"can_3_jump":true,"vx_max":1,"vy_max":1,"gravity":1,"vy_jump":1,"vx_accel_add_in_floor":1,"vx_accel_add_in_air":1,"friction_floor":1,"friction_air":1,"friction_thresh":1,"vx_off_ladder":1,"pc_scale":1,"item_scale":1,"y_cam_offset":1,"multiplier_3_jump":0.8}} ],
  ['proxy', { foo: proxy } ],
];



// Test each type individually through serializer and then deserializer
// note that this doesn't prove it works with Flash, just that it agrees with amflib.
console.log('Serializing and deserializing '+tests.length+' test values');

function dump(bin, prefix) {
  var out = "";
  for (var i = 0; i < bin.length; i++) {
    out += ("00" + bin[i].charCodeAt().toString(16)).substr(-2);
  }
  console.log("Serialized as: " + prefix + "> " + out);
}

function sanitize(value) {
  return sys.inspect(value).replace(/\n/g,' ');
}

var succeeded = 0;
var failed = 0;
for (var i = 0; i < tests.length; i++) {
  var test = tests[i];
  var descr = test[0];
  var value = test[1];
  console.log( ' > ' + descr + ': ' + sanitize(value));

  // Test serialization using amflib as baseline.
  var experimentBuffer = amfcc.serialize(value);
  var baselineBuffer = amflib.serializer().writeValue(value);
  try {
    experimentBuffer.should.be.exactly(baselineBuffer);  
    succeeded += 1;
  } catch (e) {
    console.log("Serialization error: " + e);
    if (baselineBuffer.length != experimentBuffer.length) {
      console.log("Baseline len: " + baselineBuffer.length 
               + " vs. experiment len: " + experimentBuffer.length);
    } else {
      dump(baselineBuffer, "baseline");
      dump(experimentBuffer, "experiment");
    }
    failed += 1;
  }

  // Test deserialization using original value as baseline.
  var baselineValue = amflib.deserializer(baselineBuffer).readValue(amflib.AMF3);
  var experimentValue = amfcc.deserialize(baselineBuffer).value;

  try {
    if (descr == "Number.NaN") {
      // NaN doesn't equal itself, so the Should library doesn't work for this one. 
      should(experimentValue).be.NaN;
    } else {
      should(experimentValue).eql(value);
    }
    succeeded += 1;
  } catch (e) {
    console.log("Deserialization error: " + e.message);
    console.log("Baseline: " + baselineValue);
    failed += 1;
  }
}

console.log(succeeded + "/" + (succeeded + failed) + " tests passing.");



