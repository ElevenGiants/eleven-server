# eleven-server #
This is the game server for [Eleven Giants](http://elevengiants.com/).

**Work in progress disclaimer:**
*The server is currently far, far from being able to run the game. At this
point, it does not make much sense to follow the instructions below unless you
are actually planning to get involved in the development process. If you are:
[let us know!](http://elevengiants.com/contact.php)*


## Prerequisites ##
Development and testing usually happens in our Debian based Vagrant VM, so that
is probably the least painful way to get up and running. Setup instructions for
the VM can be found in our internal wiki.

For the adventurous, it should be possible to run the server on most platforms
that support [Node.js](http://nodejs.org/) v0.10.x (though it may be more
painful on Windows). At the moment you also need
[Python 2.7](https://www.python.org/download/releases/2.7/) for the GSJS
preprocessor script.


## Setup ##
Clone this repository and [`eleven-gsjs`](https://github.com/ElevenGiants/eleven-gsjs)
in the same parent directory. Directory names are assumed to equal the Git
repository names. Call
```bash
npm -s run preproc
```
to run the preprocessor script that prepares the GSJS code for embedding in the
game server.


## Operation ##
All actions are invoked via [`npm`](https://www.npmjs.org/doc/cli/npm.html).
The following operations are available:

* `test` run the unit tests (with [mocha](https://visionmedia.github.io/mocha/))
* `functest` run functional tests
* `inttest` run integration tests (depends on external components)
* `alltests` run all tests back-to-back with reduced output (also includes the
  `lint` task below); handy as a basic smoke test before committing
* `bench` run benchmarks
* `lint` perform static code analysis with [JSHint](http://www.jshint.com/) and
  [JSCS](https://github.com/jscs-dev/node-jscs/)
* `docs` generate HTML documentation with [JSDoc](http://usejsdoc.org/)
* `start` run the server

These scripts can be called using `npm run-script` (or the alias `npm run`); the
`-s` flag hides distracting additional output, e.g.:
```bash
npm -s run test
```

Since npm currently does not have a way to provide additional arguments to
scripts, a wildcard shell argument `ARG` can be used as a workaround, e.g.:
```bash
ARG="--grep objrefProxy" npm -s run test
ARG=utils.js npm -s run bench
```
to run a specific tests or benchmark suite.


## Contributing ##
Help is always welcome! If you are interested, please [get in touch]
(http://elevengiants.com/contact.php) to get access to our [Slack]
(http://slack.com/) instance, internal documentation, guidelines and other
resources.


## License ##
[MIT](https://github.com/ElevenGiants/eleven-server/blob/master/LICENSE)
