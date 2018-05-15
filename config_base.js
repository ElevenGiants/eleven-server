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
			timeout: 10000,  // ms
		},
		// AMF library to use ('js' or 'cc')
		amflib: 'js',
		// incoming AMF messages bigger than this are considered invalid
		maxMsgSize: 131072,
		heartbeat: {
			interval: 3000,
			timeout: 60000,
		},
	},
	proc: {
		// timeout (in ms) for graceful worker process shutdown:
		shutdownTimeout: 30000,
		// timeout for worker.kill() or SIGTERM, before sending SIGKILL:
		killTimeout: 5000,
		// global timeout for worker shutdown before master itself exits:
		masterTimeout: 45000,
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
		// set to false to disable all NPC movement:
		npcMovement: true,
	},
	gsjs: {
		// the GSJS configuration variant to load
		config: 'config_prod',
	},
	god: {
		hidden_properties: ['ts', 'tsid', 'class_tsid', 'label',
			'pcont',
			'version', 'letime', 'rbtime', 'load_time', 'upd_time',
			'lastUpdateTime', 'upd_gs',
			'gstimers', 'gsintervals',
			'package_intervals']
	},
};
