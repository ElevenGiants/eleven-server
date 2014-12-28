'use strict';

/**
 * Game server configuration data.
 * This file contains reasonable default or dummy values and should not normally
 * be modified to suit a local server installation; instead, add configuration
 * for your specific local environment to 'config_local.js' (typically at least
 * the 'net' part), which is excluded from version control.
 * In particular, do NOT add any sensitive information (e.g. credentials or keys
 * for an actual public server) here.
 * Values in 'config_local.js' take precedence over the values in this file.
 */

module.exports = {
	net: {
		// If the server ID is not specified explicitly (e.g. via environment
		// variable), the server process will cycle through the following hash
		// and compare each entry's 'host' property with the list of network
		// interfaces returned by os.networkInterfaces. When a matching IP
		// address is found, the process will consider the respective config
		// block its own, and bind the GS instance(s) to that interface/port(s).
		gameServers: {
			gs01: {
				host: '127.0.0.1',
				ports: [
					1443,
					1444,
					// add TCP ports here to add GS instances on this host
				],
			},
			// add entries here (e.g. gs02, gs03, ...) for additional GS hosts
		},
		flashPolicyPort: 1843,
		assetServer: {
			host: '127.0.0.1',
			port: 8000,
		},
		rpc: {
			// process number is added to the base port for each GS instance
			// (master = 0 (i.e. running on basePort), workers = 1, 2, 3, ...)
			basePort: 7000,
		},
		// incoming AMF messages bigger than this are considered invalid
		maxMsgSize: 131072,
	},
	pers: {
		pack: {
			// how often to release "old" objects from live object cache
			interval: 30000,  // ms
			// objects that have not been modified this long are considered old
			ttl: 300000,  // ms
		},
	},
	log: {
		// dir can be an absolute path, or relative to eleven-server directory
		dir: './log',
		level: {
			file: 'info',
			stdout: 'error',
		},
		// include source file/line number in log messages:
		// (slow - do not use in production!)
		includeLoc: false,
	},
	mon: {
		statsd: {
			enabled: true,
			host: '127.0.0.1',
			port: 8125,
			// optional prefix for the metrics names:
			prefix: '',
		},
	},
	debug: {
		// REPL server for live debugging/inspection
		repl: {
			enable: true,
			host: '127.0.0.1',  // only local connections allowed by default
			basePort: 7200,
		},
		stackTraceLimit: 20,
	},
	gsjs: {
		// the GSJS configuration variant to load
		config: 'config_prod',
	},
};
