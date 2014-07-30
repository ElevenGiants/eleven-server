require('../../setup');
var suite = new (require('benchmark')).Suite;
module.exports = suite;
var fs = require('fs');
var gsjsBridge = require('model/gsjsBridge');


var data = JSON.parse(fs.readFileSync('bench/fixtures/PUVF8UK15083AI1XXX.json'));
gsjsBridge.reset();
	
	
suite.add('loadProto', function() {
	gsjsBridge.getProto('items', 'apple');
	gsjsBridge.reset();
});

suite.add('createFromData', function() {
	gsjsBridge.createFromData(data);
});
