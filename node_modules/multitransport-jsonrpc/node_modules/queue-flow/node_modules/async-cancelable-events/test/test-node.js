var jscoverage = require('jscoverage');
jscoverage.enableCoverage(true);
var coveralls = require('coveralls');
var EventEmitter = jscoverage.require(module, '../lib/async-cancelable-events');
var tests = require('./test');
tests.getEventEmitter(EventEmitter);

for(var key in tests) {
    if(key !== 'getEventEmitter') exports[key] = tests[key];
}

exports.jscoverage = function(test) {
	test.expect(1);
    jscoverage.coverageDetail();
    var coverageStats = jscoverage.coverageStats();
    Object.keys(coverageStats).forEach(function(file) {
        test.equal(coverageStats[file].total, coverageStats[file].touched, 'All lines of code exercised by the tests');
    });
    if(process.env.TRAVIS) coveralls.handleInput(jscoverage.getLCOV());
    test.done();
};
