'use strict';

// essentially nicked from <https://gist.github.com/jakwings/7772580>

var net = require('net');


var args = process.argv;
if (args.length < 3) {
	console.log('usage: %s %s <port>', args[0], args[1]);
	process.exit(1);
}
var socket = net.connect(args[2]);
process.stdin.pipe(socket);


process.stdin.on('data', function onData(buffer) {
	if (buffer.length === 1 && buffer[0] === 0x04) {  // EOT
		process.stdin.emit('end');  // process.stdin will be destroyed
		process.stdin.setRawMode(false);
		process.stdin.pause();  // stop emitting 'data' event
	}
});


// this event won't be fired if REPL is exited by '.exit' command
process.stdin.on('end', function onEnd() {
	console.log('.exit');
	socket.destroy();
});

socket.pipe(process.stdout);


socket.on('connect', function connect() {
	console.log('Connected.');
	process.stdin.setRawMode(true);
});


socket.on('close', function close() {
	console.log('Disconnected.');
	socket.removeListener('close', close);
});
