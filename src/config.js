/**
 * Configuration management module. Provides access to the parameters
 * defined in configuration files (or environment vars/command-line
 * arguments), and initializes the cluster/RPC setup data.
 *
 * @module
 */

// public interface
module.exports = {
	ConfigError: ConfigError,
	reset: reset,
	init: init,
	get: get,
	getGsid: getGsid,
	forEachGS: forEachGS,
	forEachLocalGS: forEachLocalGS,
	mapToGS: mapToGS,
};


var nconf = require('nconf');
var os = require('os');
var path = require('path');
var util = require('util');
var utils = require('utils');


var CFG_BASE = path.resolve(path.join(process.env.NODE_PATH, '..', 'config_base.js'));
var CFG_LOCAL = path.resolve(path.join(process.env.NODE_PATH, '..', 'config_local.js'));


// sorted list of game server ID strings:
var gsids;
// configuration data objects for GS instances (by gsid):
var gameServers;
// ID of this GS instance (initialized in initClusterConfig):
var gsid;


/**
 * Custom error type for configuration related errors.
 *
 * @param {string} [msg] error message
 * @constructor
 */
// see <https://stackoverflow.com/a/5251506>, <https://stackoverflow.com/a/8804539>,
// <https://code.google.com/p/v8/wiki/JavaScriptStackTraceApi>
function ConfigError(msg) {
	this.message = msg;
	Error.captureStackTrace(this, ConfigError);
}
ConfigError.prototype = Object.create(Error.prototype);
ConfigError.prototype.constructor = ConfigError;
ConfigError.prototype.name = 'ConfigError';


/**
 * Resets the module to its initial (empty) state.
 */
function reset() {
	gsids = [];
	gameServers = {};
	gsid = null;
	nconf.reset();
}


/**
 * Resets and initializes the system-wide configuration using {@link
 * https://github.com/flatiron/nconf|nconf}.
 *
 * @param {boolean} isMaster flag indicating whether this process is
 *        the cluster master
 * @param {object} [baseConfig] base configuration object (just for
 *        testing, read from file by default)
 * @param {object} [localConfig] local configuration object (just for
 *        testing, read from file by default)
 * @throws {ConfigError} if no valid configuration for the local host
 *         could be found
 */
function init(isMaster, baseConfig, localConfig) {
	reset();
	baseConfig = baseConfig || require(CFG_BASE);
	localConfig = localConfig || require(CFG_LOCAL);
	// environment variables take precedence:
	nconf.env();
	// ...then cmdline arguments:
	nconf.argv();
	// ...then anything in local config file:
	nconf.overrides(localConfig);
	// ...default values for anything not specified otherwise:
	nconf.defaults(baseConfig);
	initClusterConfig(isMaster);
	if (gsid === null) {
		throw new ConfigError('invalid network configuration for this host ' +
		'(unable to initialize GSID)');
	}
}


/**
 * Initializes the cluster setup (`gsid`, `gsids`, `gameServers`) from
 * network configuration data.
 *
 * @param {boolean} isMaster flag indicating whether this process is
 *        the cluster master
 * @private
 */
function initClusterConfig(isMaster) {
	// cycle through all configured hosts
	var gsconfs = get('net:gameServers');
	for (var hostid in gsconfs) {
		var gsconf = gsconfs[hostid];
		var local = isLocal(gsconf.host);
		// for the master process, set the ID defined in config for that host
		if (local && isMaster) {
			setGsid(hostid);
		}
		// per host, cycle through the configured GS ports
		for (var i = 0; i < gsconf.ports.length; i++) {
			// for worker processes, generate an ID like '<HOSTID>-01'
			var id = hostid + '-' + utils.padLeft('' + (i + 1), '0', 2);
			gsids.push(id);
			// generate GS configuration object for worker process
			gameServers[id] = {
				gsid: id,
				host: gsconf.host,
				port: gsconf.ports[i],
				hostPort: gsconf.host + ':' + gsconf.ports[i],
				isLocal: local,
			};
			// if we are a worker process and this ID matches the env variable
			// 'gsid', then that's us!
			if (local && !isMaster && nconf.get('gsid') === id) {
				setGsid(id);
			}
		}
	}
	utils.checkUniqueHashes(gsids);
	// sort by natural order, so loops over GS instances are deterministic
	gsids.sort();
}


/**
 * Sets the game server ID (`gsid`) for this process. Can only be
 * called once.
 *
 * @param {string} id the GSID to set
 * @throws {ConfigError} if the GSID has already been set
 * @private
 */
function setGsid(id) {
	if (gsid !== null) {
		throw new ConfigError(util.format('GSID must only be set once ' +
		'(prev: "%s", new: "%s")', gsid, id));
	}
	gsid = id;
}


/**
 * Retrieves the game server ID for this process.
 *
 * @returns {string} ID of this game server process (or `null` if it
 *          has not been set yet)
 */
function getGsid() {
	return gsid;
}


/**
 * Checks whether a given IP network address is assigned to this host.
 *
 * @param {string} address an IP address to check
 * @returns {boolean} `true` if the given IP address is assigned
 *          to a network interface on this host, `false` otherwise
 * @private
 */
function isLocal(address) {
	var ifaces = os.networkInterfaces();
	for (var dev in ifaces) {
		for (var i = 0; i < ifaces[dev].length; i++) {
			if (ifaces[dev][i].address === address) return true;
		}
	}
	return false;
}


/**
 * Retrives a configuration value (or block) from the {@link
 * https://github.com/flatiron/nconf|nconf} back-end. There are
 * multiple ways to get the same setting, i.e.:
 * ```
 *     get('log:level:file')
 *     get('log:level').file
 *     get('log').level.file
 * ```
 * The first variant is usually preferable due to its more meaningful
 * error behavior (`ConfigError` thrown, as opposed to `undefined`
 * returned or `TypeError` thrown).
 *
 * @param {string} [key] key of the desired setting (if `undefined`,
 *        the complete configuration object is returned)
 * @returns {*} the requested configuration setting or (sub-)tree
 * @throws {ConfigError} if the specified key is not defined in the
 *         current configuration
 */
function get(key) {
	var ret = nconf.get(key);
	if (ret === undefined) {
		throw new ConfigError(util.format('not found: "%s"', key));
	}
	return ret;
}


/**
 * Calls a function for each configured GS instance. The function is
 * called with the respective server configuration object as the only
 * parameter.
 *
 * @param {function} callback function to call for each GS
 */
function forEachGS(callback) {
	for (var i = 0; i < gsids.length; i++) {
		callback(gameServers[gsids[i]]);
	}
}


/**
 * Calls a function for each GS instance configured on this host. The
 * function is called with the respective server configuration object
 * as the only parameter.
 *
 * @param {function} callback function to call for each local GS
 */
function forEachLocalGS(callback) {
	forEachGS(function (gsconf) {
		if (gsconf.isLocal) {
			callback(gsconf);
		}
	});
}


/**
 * Determines which game server "owns" a given game object (i.e. where
 * other game servers should send RPC requests to when functions are
 * called on that object there), based on its TSID.
 *
 * This is **only** valid for object types that are mapped directly to
 * a game server by their own TSID, i.e. {@link Location}s and {@link
 * Group}s! For the generic function for any kind of game object, refer
 * to {@link module:data/rpc~getGsid|rpc.getGsid}.
 *
 * @param {GameObject|string} objOrTsid the game object to find the
 *        responsible game server for, or its TSID
 * @returns {object} a game server network configuration record;
 *        something along the lines of:
 * ```
 * {
 *     gsid: 'gs02-03',
 *     host: '12.34.56.78',
 *     port: 1445,
 *     hostPort: '12.34.56.78:1445',
 *     isLocal: false,
 * }
 * ```
 */
function mapToGS(objOrTsid) {
	var tsid = typeof objOrTsid === 'string' ? objOrTsid : objOrTsid.tsid;
	assert(typeof tsid === 'string' && tsid.length > 0,
		util.format('invalid TSID for %s: %s', objOrTsid, tsid));
	// using simple charcode summation for now - we may need something more
	// sophisticated later (e.g. if we need manual influence on the mapping)
	var sum = 0;
	for (var i = 0; i < tsid.length; i++) {
		sum += tsid.charCodeAt(i);
	}
	var id = gsids[sum % gsids.length];
	return gameServers[id];
}
