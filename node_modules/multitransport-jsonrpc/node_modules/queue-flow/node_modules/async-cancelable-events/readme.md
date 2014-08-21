# async-cancelable-events

[![Build Status](https://travis-ci.org/dfellis/async-cancelable-events.png?branch=master)](https://travis-ci.org/dfellis/async-cancelable-events) [![Dependency Status](https://david-dm.org/dfellis/async-cancelable-events.png)](https://david-dm.org/dfellis/async-cancelable-events) [![Coverage Status](https://coveralls.io/repos/dfellis/async-cancelable-events/badge.png?branch=master)](https://coveralls.io/r/dfellis/async-cancelable-events?branch=master)

[![browser support](https://ci.testling.com/dfellis/async-cancelable-events.png)](https://ci.testling.com/dfellis/async-cancelable-events)

An EventEmitter replacement that allows the library to make events cancelable by the event handlers and allows event handlers to be synchronous or asynchronous.

## Install

```sh
npm install async-cancelable-events
```

## Usage

```js
var EventEmitter = require('async-cancelable-events');
var util = require('util');

function MyEmittingObject() {
    EventEmitter.call(this);
    ...
}

util.inherits(MyEmittingObject, EventEmitter);
```

The API is intented to be a mostly-drop-in replacement for Node.js' EventEmitter object, with a little bit of DOM Events and more asynchronicity sprinkled in.

The primary differences between the EventEmitter and async-cancelable-events are:

1. If the last argument passed into ``this.emit`` is a function, it is assumed to be a callback that accepts a boolean indicating whether to continue the event (``true``) or cancel it (``false``).
2. The ``.on`` and ``.once`` methods try to "guess" if the provided handler is synchronous or asynchronous (based on its argument length), or can be explicitly registered as synchronous or asynchronous with ``.onSync``, ``.onAsync``, ``.onceSync``, ``.onceAsync``.
3. Passing the maximum number of listeners allowed will fire off a ``maxListenersPassed`` event with the event name and listener count as arguments. The warning the official ``EventEmitter`` prints is simply a listener for ``async-cancelable-events``, and can be disabled by running ``this.removeAllListeners('maxListenersPassed')`` just after the ``EventEmitter.call(this)`` listed above.
4. The various method calls are chainable, so ``foo.on('bar', func1).on('baz', func2)`` is valid.

## License (MIT)

Copyright (C) 2012-2013 by David Ellis

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
