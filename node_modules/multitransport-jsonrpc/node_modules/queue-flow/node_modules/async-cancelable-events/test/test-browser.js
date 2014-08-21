var tape = require('tape');
var EventEmitter = require('../lib/async-cancelable-events');
var tests = require('./test');
tests.getEventEmitter(EventEmitter);

for(var key in tests) {
    if(key !== 'getEventEmitter') tape(key, tests[key]);
}
