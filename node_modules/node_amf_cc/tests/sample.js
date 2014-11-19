/*
 * Sample usage. 
 */

//var amfcc = require('node_amf_cc');
var amfcc = require('../Build/release/node_amf_cc');

var encoded = amfcc.serialize({foo: 'bar'});
var decoded = amfcc.deserialize(encoded);
console.log(decoded.value);      // prints {foo: 'bar'}
console.log(decoded.consumed);   // prints 19, the encoded length 
