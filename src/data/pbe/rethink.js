'use strict';

/**
 * RethinkDB back-end for the persistence layer.
 *
 * @module
 */

// public interface
module.exports = {
	init: init,
	close: close,
	read: read,
	write: write,
	del: del,
};

var rdb = require('rethinkdb');
var wait = require('wait.for');


var cfg;
var conn;


/**
 * Resets and initializes the RethinkDB persistence back-end. Does
 * **not** perform any shutdown/cleanup if the module has been
 * initialized before; {@link module:data/pbe/rethink~close|close}
 * needs to be called explicitly in that case.
 *
 * @param {object} config DB connection parameters
 * @param {function} callback called when initialization is finished
 *        (connection to the DB has been established)
 */
function init(config, callback) {
	cfg = config;
	if (!cfg.queryOpts) cfg.queryOpts = {};
	conn = null;
	getConn(callback);
}


/**
 * Returns a connection to RethinkDB (establishing the connection if it
 * is not available yet).
 *
 * @private
 */
function getConn(callback) {
	if (conn) return callback(null, conn);
	var options = {
		host: cfg.dbhost,
		port: cfg.dbport,
		db: cfg.dbname,
		authKey: cfg.dbauth,
	};
	rdb.connect(options, function cb(err, res) {
		if (err) {
			if (callback) return callback(err);
			throw err;
		}
		log.info('connected to RethinkDB');
		conn = res;
		if (callback) return callback(null, conn);
	});
}


/**
 * Closes the connection to RethinkDB.
 *
 * @param {function} callback called when the shutdown process has
 *        finished, or when an error occurred
 */
function close(callback) {
	if (conn) {
		log.info('RethinkDB persistence back-end shutdown');
		conn.close(callback);
		conn = null;
		return;
	}
	return callback(null);
}


/**
 * Gets persistence data for a game object from the DB. Works either
 * synchronously or asynchronously, depending on whether a `callback`
 * parameter is supplied.
 *
 * @param {string} tsid ID of the requested game object
 * @param {object} [queryOpts] [RethinkDB query options]{@link
 *        http://www.rethinkdb.com/api/javascript/run/}; if not
 *        specified, the options passed to {@link
 *        module:data/pbe/rethink~init|init} are used
 * @param {function} [callback] called with the data for the requested
 *        game object (*not* a {@link GameObject} instance), or an
 *        error; if `undefined`, the data is returned instead (or an
 *        error thrown)
 * @returns {object} game object data if no `callback` function was
 *          given (`undefined` otherwise)
 */
function read(tsid, queryOpts, callback) {
	if (!callback) {
		callback = queryOpts;
		queryOpts = null;
	}
	var query = rdb.table(cfg.dbtable).get(tsid);
	if (callback) {
		// async version
		runQuery(query, queryOpts, function cb(err, data) {
			return callback(err, data);
		});
	}
	else {
		// sync (fibers) version
		return wait.for(runQuery, query, queryOpts);
	}
}


/**
 * Writes game object data to the DB.
 *
 * @param {object|array} data serialized game object data (*not* actual
 *        {@link GameObject} instances); may be a single object or an array
 * @param {object} [queryOpts] [RethinkDB query options]{@link
 *        http://www.rethinkdb.com/api/javascript/run/}; if not
 *        specified, the options passed to {@link
 *        module:data/pbe/rethink~init|init} are used
 * @param {function} callback called when the object was written, or an
 *        error occurred
 */
function write(data, queryOpts, callback) {
	if (!callback) {
		callback = queryOpts;
		queryOpts = null;
	}
	var query = rdb.table(cfg.dbtable).insert(rdb.json(JSON.stringify(data)),
		{conflict: 'replace'});
	runQuery(query, queryOpts, callback);
}


/**
 * Removes game object data from the DB.
 *
 * @param {object} tsid ID of the game object to be removed
 * @param {object} [queryOpts] [RethinkDB query options]{@link
 *        http://www.rethinkdb.com/api/javascript/run/}; if not specified, the
 *        options passed to {@link module:data/pbe/rethink~init|init} are used
 * @param {function} callback called when the object was deleted, or an
 *        error occurred
 */
function del(tsid, queryOpts, callback) {
	if (!callback) {
		callback = queryOpts;
		queryOpts = null;
	}
	var query = rdb.table(cfg.dbtable).get(tsid).delete();
	runQuery(query, queryOpts, callback);
}


function runQuery(query, opts, callback) {
	opts = opts || cfg.queryOpts;
	getConn(function cb(err, conn) {
		if (err) return callback(err);
		query.run(conn, opts, callback);
	});
}
