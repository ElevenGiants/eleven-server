var tape = require('tape');
var tests = require('./test');

for(var key in tests) {
    if(key !== 'complexity') tape(key, tests[key]);
}
