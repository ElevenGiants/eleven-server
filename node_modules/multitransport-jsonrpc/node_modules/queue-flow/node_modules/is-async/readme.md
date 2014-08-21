# is-async [![Build Status](https://travis-ci.org/dfellis/is-async.png)](https://travis-ci.org/dfellis/is-async)

[![browser support](https://ci.testling.com/dfellis/is-async.png)](https://ci.testling.com/dfellis/is-async)

A simple method to guess whether or not a given method is asynchronous.

## Install

```sh
npm install is-async
```

## Usage

```js
var isAsync = require('is-async');

function foo(bar, callback) {
    callback(bar*2);
}

isAsync(foo, 2); // Returns true, isAsync was told a function with two arguments is probably true

function forceAsync(bar, baz, callback) {
    callback(bar*baz);
}

forceAsync.async = true; // Adding an ``async`` property to the function

isAsync(forceAsync); // Returns true, the ``async`` property takes precedence

function forceSync(bar, baz) {
    return bar*baz;
}

forceSync.sync = true; // Similar override property

isAsync(forceSync, 2); // Returns false, even though its considered "probably async" because of the ``sync`` property.
```

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
