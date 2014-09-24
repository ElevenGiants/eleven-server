'use strict';

require('../../setup');
var suite = new (require('benchmark')).Suite;
module.exports = suite;
var RequestContext = require('data/RequestContext');


suite.add('run (fire&forget)', function() {
	new RequestContext().run(
		function req() {
		},
		function cb(err) {
			if (err) throw err;
		}
	);
});


suite.add('run (sequential/wait for result)', function(deferred) {
	new RequestContext().run(
		function req() {
		},
		function cb(err) {
			if (err) throw err;
			deferred.resolve();
		}
	);
}, {defer: true});
