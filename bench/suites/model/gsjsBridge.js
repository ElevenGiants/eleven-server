'use strict';

require('../../setup');
var suite = new (require('benchmark')).Suite;
module.exports = suite;
var fs = require('fs');
var gsjsBridge = require('model/gsjsBridge');
var config = require('config');


var data = JSON.parse(fs.readFileSync('bench/fixtures/PUVF8UK15083AI1XXX.json'));


suite.asyncSetup = function(done) {
	config.init(true, {
		gsjs: {
			config: 'config_prod',
		},
	});
	gsjsBridge.init(false, done);
};


suite.add('loadProto (cached)', function() {
	gsjsBridge.getProto('items', 'apple');
});

suite.add('createFromData (cached)', function() {
	gsjsBridge.create(data);
});


suite.add('loadProto (uncached)', function() {
	gsjsBridge.getProto('items', 'apple');
	gsjsBridge.reset();
}, {
	onStart: function onStart() {
		gsjsBridge.reset();
	},
});


suite.add('createFromData (uncached)', function() {
	gsjsBridge.create(data);
	gsjsBridge.reset();
}, {
	onStart: function onStart() {
		gsjsBridge.reset();
	},
});
