node_amf_cc
===========
https://www.npmjs.org/package/node_amf_cc

NodeJS addon written in C++ which implements the [AMF 3 specification](http://wwwimages.adobe.com/www.adobe.com/content/dam/Adobe/en/devnet/amf/pdf/amf-file-format-spec.pdf).  This implements nearly all the AMF3 features of [amflib](https://www.npmjs.org/package/amflib) but with at least an order of magnitude better performance for long tail payloads.

Written as part of the [Eleven Giants](https://github.com/ElevenGiants) project.

Installation:

    npm install node_amf_cc

Usage:

    var amfcc = require('node_amf_cc');

    var encoded = amfcc.serialize({foo: 'bar'});
    var decoded = amfcc.deserialize(encoded);
    console.log(decoded.value);  // prints {foo: 'bar'}
    console.log(decoded.consumed);  

Benchmark results from my machine focusing on tail payloads:

    amflib/deserialize x 4.29 ops/sec ±2.02% (15 runs sampled)
    amfcc/deserialize x 42.70 ops/sec ±2.37% (57 runs sampled)
    amflib/serialize x 2.71 ops/sec ±2.26% (11 runs sampled)
    amfcc/serialize x 41.40 ops/sec ±3.30% (56 runs sampled)

To compile the addon from source:

    $ node-gyp configure
    $ node-gyp build

To run feature tests:

    $ npm install amflib should
    $ node tests/should.js

To run benchmarks:

    $ npm install amflib benchmark segfault-handler
    $ node tests/benchmark.js

Still need to support:
* Serialization of proxy objects.

You can workaround the lack of support for proxies with something like
JSON.parse(JSON.stringify(msg)) till I have time to implement serialization
code for them.

No plans to support:
* AMF 0 specification
* XMLDocument Type
* Associative (ECMA) arrays
* XML Type 
* ByteArray type
* Vector type
* Dictionary type
* Externalizable traits (variant of Object type)


