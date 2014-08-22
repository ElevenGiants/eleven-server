/**
 * Quick-and-dirty benchmark suite runner. Runs the files in SUITE_DIR
 * (including subdirectories) one by one as BenchmarkJS suites, each
 * one in a separate process.
 */

var fs = require('fs');
var path = require('path');
var spawn = require('child_process').spawn;


var SUITE_DIR = path.resolve(path.join(__dirname, 'suites'));
var entries = fs.readdirSync(SUITE_DIR);


function runSuites() {
	var entry = entries.shift();
	if (!entry) return;
	var entryPath = path.resolve(path.join(SUITE_DIR, entry));
	var stat = fs.statSync(entryPath);
	if (stat.isDirectory()) {
		var subEntries = fs.readdirSync(entryPath);
		for (var i = 0; i < subEntries.length; i++) {
			entries.push(path.join(entry, subEntries[i]));
		}
		return process.nextTick(runSuites);
	}
	else if (stat.isFile()) {
		spawnSuite(entryPath);
	}
}


function spawnSuite(suitePath) {
	var args = (process.execArgv || []).concat([process.argv[1], suitePath]);
	var child = spawn(process.execPath, args, {stdio: 'inherit'});
	child.on('close', function(code) {
		if (code) {
			console.log('%s failed (%s).', suitePath, code);
			process.exit(code);
		}
		else {
			runSuites();
		}
	});
}


function runSuite(suitePath) {
	suitePath = path.resolve(SUITE_DIR, suitePath);
	var name = suitePath.slice(SUITE_DIR.length + 1);
	console.log('\nrunning bench suite %s...', name);
	var suite = require(suitePath);
	// workaround for asynchronous suite setup (cf. <https://github.com/bestiejs/benchmark.js/issues/70>)
	var setup = suite.asyncSetup || function(cb) { cb(); };
	setup(function cb() {
		suite.on('cycle', onCycle);
		suite.on('error', onError);
		suite.run();
	});
}


function onError(event) {
	console.log('\terror running %s: %s', event.target.name, event.target.error);
}


function onCycle(event) {
	if (!event.target.error) {
		console.log('\t' + String(event.target));
	}
}


function main() {
	var target = process.argv[2];
	if (target) {
		runSuite(target);
	}
	else {
		runSuites();
	}
}


if (require.main === module) {
	main();
}
