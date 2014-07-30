require('../../setup');
var suite = new (require('benchmark')).Suite;
module.exports = suite;
var requestContext = require('data/requestContext');


suite.add('run', function() {
	requestContext.run(
		function req() {
		},
		undefined, undefined,
		function cb(err) {
			if (err) throw err;
		}
	);
});
