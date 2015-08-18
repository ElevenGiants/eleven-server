# eleven-server #
This is the game server for [Eleven Giants](http://elevengiants.com/).

**Work in progress disclaimer:**
*The server is currently only able to run a very limited portion of the game. To
actually start up the client with it, additional components are required, which
are not publicly available at this time. If you want to get involved in the
development process, please [let us know!](http://elevengiants.com/contact.php)*


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
**Note:** *The following setup steps are **not** necessary if you are using the
Vagrant box and created the VM with the `eleven-server` and `eleven-gsjs` repos
already present.*

Clone this repository and [`eleven-gsjs`](https://github.com/ElevenGiants/eleven-gsjs)
in the same parent directory. Directory names are assumed to equal the Git
repository names. Call
```bash
npm -s run preproc
```
to run the preprocessor script that prepares the GSJS code for embedding in the
game server.

Once that has finished successfully, compile the required non-JS npm packages:
```bash
npm rebuild
```
If you are running the Vagrant VM on Windows, add `--no-bin-links` as an
argument (necessary because symlinks cannot be created in folders shared between
the VM and the Windows host).

The server expects environment specific parts of the configuration in a file
called `config_local.js` in its root directory. Copy one of the
`config_local.js.SAMPLE_*` files and adjust it according to your needs.


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

To run specific tests or benchmark suites, append arguments for the test or
benchmark runner with `--`, e.g.:
```bash
npm -s run test -- --grep objrefProxy
npm -s run bench -- utils.js
```
(this requires npm >= 2.0.0)


## Contributing ##
Help is always welcome! If you are interested, please [get in touch]
(http://elevengiants.com/contact.php) to get access to our [Slack]
(http://slack.com/) instance, internal documentation, guidelines and other
resources.

(If you are in fact already signed up and ready to go, have a look
[here](https://github.com/ElevenGiants/eleven-server/blob/master/CONTRIBUTING.md)).


## License ##
[MIT](https://github.com/ElevenGiants/eleven-server/blob/master/LICENSE)
