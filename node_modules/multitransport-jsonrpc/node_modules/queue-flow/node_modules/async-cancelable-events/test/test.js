var EventEmitter;

function bootstrap(test) {
    test.expect = test.expect || test.plan;
    test.done = test.done || test.end;
}

exports.getEventEmitter = function(ee) {
    EventEmitter = ee;
};

exports.simpleEvent = function(test) {
    bootstrap(test);
    test.expect(1);
    var emitter = new EventEmitter();
    emitter.on('hi', function() {
        test.ok(true, 'received the event');
        test.done();
    });
    emitter.emit('hi');
};

exports.cancelableEvent = function(test) {
    bootstrap(test);
    test.expect(2);
    var emitter = new EventEmitter();
    emitter.on('toCancel', function() {
        test.ok(true, 'received the event');
        return false;
    });
    emitter.emit('toCancel', function(result) {
        test.ok(result === false, 'informed to cancel the event');
        test.done();
    });
};

exports.asyncEventListener = function(test) {
    bootstrap(test);
    test.expect(3);
    var emitter = new EventEmitter();
    emitter.on('toAccept', function(callback) {
        test.ok(true, 'received the event');
        test.ok(callback instanceof Function, 'received a callback function');
        callback(true);
    });
    emitter.emit('toAccept', function(result) {
        test.ok(result, 'informed to continue the event');
        test.done();
    });
};

exports.forceListenerType = function(test) {
    bootstrap(test);
    test.expect(4);
    var emitter = new EventEmitter();
    emitter.onSync('toAccept', function(optionalValue) {
        test.ok(true, 'received the event');
        test.ok(!optionalValue, 'nothing passed into the optionalValue slot');
        // not returning false is the same as returning true
    });
    emitter.onAsync('toAccept', function(optionalValue, callback) {
        if(!callback) callback = optionalValue;
        test.ok(true, 'received the event');
        callback();
    });
    emitter.emit('toAccept', function(result) {
        test.ok(result, 'informed to continue the event');
        test.done();
    });
};

exports.oneTimeListener = function(test) {
    bootstrap(test);
    test.expect(4);
    var emitter = new EventEmitter();
    emitter.once('toAccept', function() {
        test.ok(true, 'received the event');
    });
    test.equal(EventEmitter.listenerCount(emitter, 'toAccept'), 1, 'one listener registered for the event');
    emitter.emit('toAccept', function(result) {
        test.ok(result, 'informed to continue the event');
        test.equal(EventEmitter.listenerCount(emitter, 'toAccept'), 0, 'the one-time listener removed');
        test.done();
    });
};

exports.oneTimeListenerSyncEmit = function(test) {
    bootstrap(test);
    test.expect(2);
    var emitter = new EventEmitter();
    emitter.once('toAccept', function() {
        test.ok(true, 'received the event');
        test.equal(EventEmitter.listenerCount(emitter, 'toAccept'), 0, 'the one-time-listener removed');
        test.done();
    });
    emitter.emitSync('toAccept');
};

exports.forceOneTimeType = function(test) {
    bootstrap(test);
    test.expect(5);
    var emitter = new EventEmitter();
    emitter.onceSync('toAccept', function(optionalValue) {
        test.ok(!optionalValue, 'no value passed in');
        test.equal(EventEmitter.listenerCount(emitter, 'toAccept'), 0, 'the one-time-listener removed');
    });
    emitter.onceAsync('toAccept', function(optionalValue, callback) {
        if(!callback) callback = optionalValue;
        test.ok(optionalValue instanceof Function, 'no value passed in');
        test.equal(EventEmitter.listenerCount(emitter, 'toAccept'), 0, 'the one-time-listener removed');
        test.done();
    });
    test.equal(EventEmitter.listenerCount(emitter, 'toAccept'), 2, 'the one-time-listeners added');
    emitter.emit('toAccept');
};

exports.emitSyncEventCancelationStopsEventEval = function(test) {
    bootstrap(test);
    test.expect(1);
    var emitter = new EventEmitter();
    emitter.on('testEvent', function(callback) {
        test.ok(true, 'received the event');
        test.done();
        callback(false);
    });
    emitter.on('testEvent', function() {
        test.ok(false, 'this should never run');
    });
    emitter.emitSync('testEvent');
};

exports.eventEmitterEvents = function(test) {
    bootstrap(test);
    test.expect(15);
    var emitter = new EventEmitter();
    emitter.setMaxListeners(2);
    emitter.on('newListener', function(listener) {
        test.ok(listener instanceof Function, 'got a new listener');
    });
    emitter.on('maxListenersPassed', function(eventName, count) {
        test.equal(eventName, 'someEvent', 'added too many listeners to someEvent');
        test.equal(count, 3, "this town ain't big enough for the two of us!");
    });
    emitter.on('removeListener', function(listener) {
        test.ok(listener instanceof Function, 'got the removed listener');
    });
    emitter.once('someEvent', function() {
        test.ok(true, 'first listener fired');
    });
    emitter.once('someEvent', function() {
        test.ok(true, 'second listener fired');
    });
    emitter.once('someEvent', function() {
        test.ok(true, 'third listener fired');
    });
    emitter.emit('someEvent', function() {
        test.ok(true, 'event finished');
        test.done();
    });
};

exports.listenerList = function(test) {
    bootstrap(test);
    test.expect(1);
    var emitter = new EventEmitter();
    var fooFunc = function() {};
    emitter.on('foo', fooFunc);
    test.equal(fooFunc, emitter.listeners('foo')[0], 'got the expected function');
    test.done();
};

exports.removeListener = function(test) {
    bootstrap(test);
    test.expect(1);
    var emitter = new EventEmitter();
    var fooFunc = function() {};
    var barFunc = function() {};
    emitter.on('foo', fooFunc);
    emitter.on('foo', barFunc);
    var bazFunc = function() {};
    var bayFunc = function() {};
    emitter.once('foo', bazFunc);
    emitter.once('foo', bayFunc);
    emitter.removeListener('foo', barFunc);
    emitter.removeListener('foo', bayFunc);
    test.equal(emitter.listeners('foo').length, 2, 'the emitters were removed');
    test.done();
};

exports.removeAllListeners = function(test) {
    bootstrap(test);
    test.expect(3);
    var emitter = new EventEmitter();
    var fooFunc = function() {};
    var barFunc = function() {};
    var bazFunc = function() {};
    var bayFunc = function() {};
    emitter.on('foo', fooFunc);
    emitter.once('foo', barFunc);
    emitter.on('baz', bazFunc);
    emitter.once('bay', bayFunc);
    emitter.removeAllListeners('foo');
    test.equal(emitter.listeners('foo').length, 0, 'the emitters were removed');
    test.equal(emitter.listeners('baz').length + emitter.listeners('bay').length, 2, 'the emitters were not removed');
    emitter.removeAllListeners();
    test.equal(emitter.listeners('baz').length + emitter.listeners('bay').length, 0, 'the emitters were removed');
    test.done();
};

exports.ifYouEmitAndThereAreNoListenersDoYouEmitAnything = function(test) {
    bootstrap(test);
    test.expect(1);
    var emitter = new EventEmitter();
    emitter.emit('foo', 'bar', function(result) {
        test.ok(result, 'the emitter got a good result');
        test.done();
    });
};
