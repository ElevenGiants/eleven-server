var bunyan = require('bunyan');
var chai = require('chai');


initGlobals();


function initGlobals() {
	global.assert = chai.assert;
	global.log = bunyan.createLogger({
		name: 'testlog',
		src: true,
		streams: [
			{
				level: 'fatal',
				stream: process.stderr,
			},
		],
	});
}
