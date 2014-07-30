var bunyan = require('bunyan');


initGlobals();


function initGlobals() {
	global.log = bunyan.createLogger({
		name: 'benchlog',
		src: true,
		streams: [
			{
				level: 'error',
				stream: process.stderr,
			},
		],
	});
}
