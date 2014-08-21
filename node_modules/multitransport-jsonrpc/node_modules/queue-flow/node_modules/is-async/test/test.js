var isAsync = require('../lib/is-async');
var cr = require('complexity-report');
var fs = require('fs');

function bootstrap(test) {
    test.expect = test.expect || test.plan;
    test.done = test.done || test.end;
}

exports.guesswork = function(test) {
    bootstrap(test);
    test.expect(3);
    function foo() {
        return 1;
    }
    function bar(baz, callback) {
        callback(baz);
    }
    test.equal(isAsync(foo, 2), false, 'foo is not considered an async function with two total arguments');
    test.equal(isAsync(bar, 2), true, 'bar is considered an async function');
    test.equal(isAsync(bar, 3), false, 'bar is not considered an async function when expecting three total arguments');
    test.done();
};

exports.forced = function(test) {
    bootstrap(test);
    test.expect(2);
    function forceAsync() {}
    forceAsync.async = true;
    function forceSync() {}
    forceSync.sync = true;
    test.equal(isAsync(forceAsync), true, 'forceAsync forces isAsync to return true');
    test.equal(isAsync(forceSync), false, 'forceSync forced isAsync to return false');
    test.done();
};

exports.complexity = function(test) {
    bootstrap(test);
    test.expect(1);
    test.ok(70 <= cr.run(fs.readFileSync('./lib/is-async.js', 'utf8')).maintainability, 'is-async is not considered overly complex');
    test.done();
};
