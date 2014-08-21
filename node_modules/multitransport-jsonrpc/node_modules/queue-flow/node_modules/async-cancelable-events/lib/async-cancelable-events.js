var isAsync = require('is-async');

// ## printMaxListenersWarning
// is a listener that prints a warning when the max listeners has been exceeded just
// like the ``EventEmitter`` does, but now you can clear it out by executing
// ``this.removeAllListeners('maxListenersPassed')`` in your constructor function
// just after running the ``AsyncCancelableEvents`` constructor function in your own
// constructor function.
function printMaxListenersWarning(eventName, listenerCount) {
    console.warn('The Event ' + eventName + ' has exceeded ' + this._maxListeners + ' listeners, currently at ' + listenerCount);
}

// # AsyncCancelableEvents
// constructor function, a drop-in replacement for ``EventEmitter`` almost every time
// (excepting when an event emits a function, then use ``emitSync``) that also allows
// the event listeners to cancel events if ``emit`` is provided with a callback.
// Event listeners may be either synchronous like DOM events or asynchronous to better
// fit the Node.js style. (Because of that, making an event placed inside of a high
// performance loop is probably a bad idea because the event listeners can introduce
// an unpredictable delay.) The ``AsyncCancelableEvents`` constructor function attaches
// three "please don't touch" properties to itself (or its inheriting object) to keep
// track of listeners and the maximum number of allowed listeners.
function AsyncCancelableEvents() {
    this._eventListeners = {};
    this._oneTimeListeners = {};
    this._maxListeners = 10;
    this.on('maxListenersPassed', printMaxListenersWarning.bind(this));
}

// ## emit
// takes and event name and a variable number of arguments. If the last argument is a
// function, it assumes it's a callback for the event and that this event is cancelable.
// Listeners can only cancel events if their return value (or callback parameter) is
// ``false``, any other value is considered ``true`` and the event continues. Event
// cancelation immediately ends all processing of event listeners. The order of event
// listeners is roughly that of the order they were attached, but ``once`` listeners
// are given priority over ``on`` listeners (so its possible to do a one-time
// cancelation and not have any of the ``on`` listeners called).
AsyncCancelableEvents.prototype.emit = function emit(eventName) {
    // Short-circuit for emit calls with no listeners
    if(!this._oneTimeListeners[eventName] && !this._eventListeners[eventName]) {
        if(arguments[arguments.length-1] instanceof Function) arguments[arguments.length-1](true);
        return this;
    }
    // Get the list of arguments for the listeners into an array
    var argsArray = Array.prototype.slice.call(arguments, 1, arguments.length);
    // If the last argument is a function, assume its a callback for ``emit`` and pop it off
    var callback = argsArray[argsArray.length-1] instanceof Function ? argsArray[argsArray.length-1] : undefined;
    if(callback) argsArray.pop();
    // Create an array of listeners to call for this particular event, taking the ``once``
    // listeners first and firing the removeListener event, then attaching any ``on``
    // listeners. In both cases only if they exist.
    var listenersToCall = [];
    if(this._oneTimeListeners[eventName] instanceof Array) {
        listenersToCall = this._oneTimeListeners[eventName];
        delete this._oneTimeListeners[eventName];
        listenersToCall.forEach(function(listener) {
            this.emitSync('removeListener', listener);
        }.bind(this));
    }
    if(this._eventListeners[eventName] instanceof Array) Array.prototype.push.apply(listenersToCall, this._eventListeners[eventName]);
    // An asynchronous iterator for the listeners. If the return value given to it is ``false``,
    // immediately end and call the callback, if it exists, otherwise if there are still listeners
    // to call, call them (determining whether or not the listener is asynchronous) and pass the
    // result into the iterator function (either by callback or simply calling itself recursively
    // if synchronous). If there are no more listeners to call and none of them returned ``false``,
    // finally return ``true`` to the callback function, if it exists.
    var iterate = function iterate(retVal) {
        if(retVal === false) {
            if(callback) callback(false);
        } else {
            if(listenersToCall.length) {
                var listener = listenersToCall.shift();
                if(isAsync(listener, argsArray.length)) {
                    listener.apply(null, argsArray);
                } else {
                    argsArray.pop();
                    var result = listener.apply(null, argsArray);
                    argsArray.push(iterate);
                    iterate(result);
                }
            } else {
                if(callback) callback(true);
            }
        }
    };
    argsArray.push(iterate);
    // Call the iterate function with ``true`` to kick off the recursive process
    iterate(true);
    // Whenever possible, have the methods return ``this`` so they can be chained
    return this;
};

// ## emitAsync
// In this case, forcing async means the same thing as the normal version of the function
AsyncCancelableEvents.prototype.emitAsync = AsyncCancelableEvents.prototype.emit;

// ## emitSync
// Unfortunately for synchronous emit, the logic is changed enough that simply wrapping
// ``sync`` (as done below with other methods) is not possible, but the overall pattern
// of getting the arguments, the listeners to call, and iterating through them is still
// the same. In this case, however, the last argument is always passed to the listeners
// and what the listeners return is only checked for canceling the listeners calling list,
// the result is never returned.
AsyncCancelableEvents.prototype.emitSync = function emitSync(eventName) {
    if(!this._oneTimeListeners[eventName] && !this._eventListeners[eventName]) {
        return this;
    }
    var argsArray = Array.prototype.slice.call(arguments, 1, arguments.length);
    var listenersToCall = [];
    if(this._oneTimeListeners[eventName] instanceof Array) {
        listenersToCall = this._oneTimeListeners[eventName];
        delete this._oneTimeListeners[eventName];
        listenersToCall.forEach(function(listener) {
            this.emitSync('removeListener', listener);
        }.bind(this));
    }
    if(this._eventListeners[eventName] instanceof Array) Array.prototype.push.apply(listenersToCall, this._eventListeners[eventName]);
    var iterate = function iterate(retVal) {
        if(retVal !== false) {
            if(listenersToCall.length) {
                var listener = listenersToCall.shift();
                if(isAsync(listener, argsArray.length)) {
                    listener.apply(null, argsArray);
                } else {
                    argsArray.pop();
                    var result = listener.apply(null, argsArray);
                    argsArray.push(iterate);
                    iterate(result);
                }
            }
        }
    };
    argsArray.push(iterate);
    iterate(true);
    return this;
};

// ## on
// The bread-n-butter of an EventEmitter, registering listeners for events. In this
// implementation, the event types are lazily determined, as this is the most
// obvious implementation for Javascript, and high performance for registering
// listeners shouldn't be an issue. If the total number of listeners exceeds the
// maximum specified, the ``maxListenersPassed`` event is fired with the event name
// and listener count as arguments provided to the listener. Like all events internal
// to ``AsyncCancelableEvents``, it is not cancelable, itself. Once registered, the
// ``newListener`` event is emitted.
AsyncCancelableEvents.prototype.on = function on(eventName, listener) {
    if(!this._eventListeners) this._eventListeners = {};
    this._eventListeners[eventName] = this._eventListeners[eventName] instanceof Array ? this._eventListeners[eventName] : [];
    this._eventListeners[eventName].push(listener);
    var listenerCount = this._eventListeners[eventName].length + (this._oneTimeListeners[eventName] instanceof Array ? this._oneTimeListeners[eventName].length : 0);
    if(listenerCount > this._maxListeners) this.emitSync('maxListenersPassed', eventName, listenerCount);
    this.emitSync('newListener', listener);
    return this;
};

// ## onSync
// Taking advantage of the ``is-async`` method's behavior, registering a forced
// synchronous event simply requires attaching a truthy ``sync`` property to the
// method and then registering it as usual.
AsyncCancelableEvents.prototype.onSync = function onSync(eventName, listener) {
    listener.sync = true;
    return this.on(eventName, listener);
};

// ## onAsync
// Similarly for forced asynchronous functions, just attach a truthy ``async`` property
AsyncCancelableEvents.prototype.onAsync = function onAsync(eventName, listener) {
    listener.async = true;
    return this.on(eventName, listener);
};

// ## addListener, addListenerSync, addListenerAsync
// These methods are just synonyms for the ``on*`` methods, kept just to make sure
// ``AsyncCancelableEvents`` should "just work" for the majority of use-cases of
// ``EventEmitter``.
AsyncCancelableEvents.prototype.addListener = AsyncCancelableEvents.prototype.on;
AsyncCancelableEvents.prototype.addListenerSync = AsyncCancelableEvents.prototype.onSync;
AsyncCancelableEvents.prototype.addListenerAsync = AsyncCancelableEvents.prototype.onAsync;

// ## once
// The ``once`` method works very similar to the ``on`` method, except it operates on the
// ``_oneTimeListeners`` property, instead. This could probably be DRYed out a bit, but
// will only save a few lines of code and I don't expect this library to change much.
AsyncCancelableEvents.prototype.once = function once(eventName, listener) {
    if(!this._oneTimeListeners) this._oneTimeListeners = {};
    this._oneTimeListeners[eventName] = this._oneTimeListeners[eventName] instanceof Array ? this._oneTimeListeners[eventName] : [];
    this._oneTimeListeners[eventName].push(listener);
    var listenerCount = this._oneTimeListeners[eventName].length + (this._eventListeners[eventName] instanceof Array ? this._eventListeners[eventName].length : 0);
    if(listenerCount > this._maxListeners) this.emitSync('maxListenersPassed', eventName, listenerCount);
    this.emitSync('newListener', listener);
    return this;
};

// ## onceSync
// Exactly like ``onSync``, but with a different method involved. Attempting to DRY
// this would produce a net *gain* in lines of code.
AsyncCancelableEvents.prototype.onceSync = function onceSync(eventName, listener) {
    listener.sync = true;
    return this.once(eventName, listener);
};

// ## onceAsync
// Exactly like ``onAsync`` but for ``once``.
AsyncCancelableEvents.prototype.onceAsync = function onceAsync(eventName, listener) {
    listener.async = true;
    return this.once(eventName, listener);
};

// ## removeListener
// Checks if the event has any listeners registered and then filters out the provided listener,
// firing the ``removeListener`` event if found. It must be a reference to the same function,
// not just have equal ``toString`` results.
AsyncCancelableEvents.prototype.removeListener = function removeListener(eventName, listener) {
    if(this._eventListeners[eventName] instanceof Array) {
        this._eventListeners[eventName] = this._eventListeners[eventName].filter(function(registeredListener) {
            if(registeredListener === listener) {
                this.emitSync('removeListener', listener);
                return false;
            } else {
                return true;
            }
        }.bind(this));
    }
    if(this._oneTimeListeners[eventName] instanceof Array) {
        this._oneTimeListeners[eventName] = this._oneTimeListeners[eventName].filter(function(registeredListener) {
            if(registeredListener === listener) {
                this.emitSync('removeListener', listener);
                return false;
            } else {
                return true;
            }
        }.bind(this));
    }
    return this;
};

// ## removeAllListeners
// If an event name is provided, it removes all of the listeners for that event (if the event
// exists) and emits the ``removeListener`` event for each listener. If not called with an
// event name, it generates a list of events and recursively calls itself for each event.
AsyncCancelableEvents.prototype.removeAllListeners = function removeAllListeners(eventName) {
    if(eventName) {
        if(this._eventListeners[eventName] instanceof Array) {
            this._eventListeners[eventName].forEach(function(listener) {
                this.emitSync('removeListener', listener);
            }.bind(this));
            delete this._eventListeners[eventName];
        }
        if(this._oneTimeListeners[eventName] instanceof Array) {
            this._oneTimeListeners[eventName].forEach(function(listener) {
                this.emitSync('removeListener', listener);
            }.bind(this));
            delete this._oneTimeListeners[eventName];
        }
    } else {
        Object.keys(this._eventListeners).forEach(function(eventName) {
            this.removeAllListeners(eventName);
        }.bind(this));
        Object.keys(this._oneTimeListeners).forEach(function(eventName) {
            this.removeAllListeners(eventName);
        }.bind(this));
    }
    return this;
};

// ## setMaxListeners
// 'Nuff said.
AsyncCancelableEvents.prototype.setMaxListeners = function setMaxListeners(count) {
    this._maxListeners = count;
    return this;
};

// ## listeners
// Returns an array of registered listeners for the given event. This array is a copy
// so you can alter it at will, but the functions it points to are not copies, so
// properties attached to them will propagate back into ``AsyncCancelableEvents``.
AsyncCancelableEvents.prototype.listeners = function listeners(eventName) {
    var registeredListeners = [];
    if(this._eventListeners[eventName] instanceof Array) Array.prototype.push.apply(registeredListeners, this._eventListeners[eventName]);
    if(this._oneTimeListeners[eventName] instanceof Array) Array.prototype.push.apply(registeredListeners, this._oneTimeListeners[eventName]);
    return registeredListeners;
};

// ## listenerCount
// Not sure why ``EventEmitter`` didn't make this a prototype method, but here you go.
// Given an ``AsyncCancelableEvents`` instance and an event name, it returns the number
// of listeners registered on that event.
AsyncCancelableEvents.listenerCount = function listenerCount(instance, eventName) {
    var count = 0;
    if(instance._eventListeners[eventName] instanceof Array) count += instance._eventListeners[eventName].length;
    if(instance._oneTimeListeners[eventName] instanceof Array) count += instance._oneTimeListeners[eventName].length;
    return count;
};

// Export ``AsyncCancelableEvents``
module.exports = AsyncCancelableEvents;
