require('../../setup');
var suite = new (require('benchmark')).Suite;
module.exports = suite;
var requestContext = require('data/requestContext');


suite.add('run (fire&forget)', function() {
	requestContext.run(
		function req() {
		},
		undefined, undefined,
		function cb(err) {
			if (err) throw err;
		}
	);
});


suite.add('run (sequential/wait for result)', function(deferred) {
	requestContext.run(
		function req() {
		},
		undefined, undefined,
		function cb(err) {
			if (err) throw err;
			deferred.resolve();
		}
	);
}, {defer: true});
