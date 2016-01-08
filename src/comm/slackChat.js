'use strict';

/**
 * Slack integration for in-game chat. Allows coupling game groups
 * (e.g. global, live help) with Slack channels, using the Slack
 * real-time messaging API.
 *
 * @module
 */

// public interface
module.exports = {
	init: init,
	shutdown: shutdown,
	getClient: getClient,
	patchGroup: patchGroup,
	handleGroupMsg: handleGroupMsg,
};


var Slack = require('slack-client');
var config = require('config');
var pers = require('data/pers');
var RQ = require('data/RequestQueue');
var rpc = require('data/rpc');
var util = require('util');
var utils = require('utils');

var slack;
// bidirectional mapping between GS goups and Slack channels/groups
var groupToChannel = {};
var channelToGroup = {};


/**
 * Initialize Slack integration (if configured).
 * Should be called on each GS worker during startup.
 */
function init() {
	var token = config.get('slack:chat:token');
	if (!token) {
		log.info('Slack integration not configured (no token)');
		return;
	}
	log.debug('connecting to Slack');
	slack = new Slack(token);
	slack.logger = log.child({lib: 'slack-client'});
	slack.on('open', onSlackOpen);
	slack.on('error', onSlackError);
	slack.on('message', onSlackMessage);
	slack.login();
}


/**
 * Shuts down integration, closes connection to Slack.
 */
function shutdown(done) {
	if (slack) {
		log.info('Slack client shutdown');
		slack.disconnect();
	}
	if (done) done();
}


/**
 * After successful login, initializes the links between GS groups and
 * Slack channels/groups as configured.
 * @private
 */
function onSlackOpen() {
	log.info('connected to Slack as %s', slack.self.name);
	var groups = config.get('slack:chat:groups', {});
	for (var tsid in groups) {
		var chanName = groups[tsid];
		log.debug('hooking up group %s to Slack channel #%s', tsid, chanName);
		connectGroup(tsid, chanName, slack.channels);
		// no channel found? try groups, then
		if (!groupToChannel[tsid]) {
			connectGroup(tsid, chanName, slack.groups);
		}
		if (!groupToChannel[tsid]) {
			log.error('channel/group %s not found', chanName);
		}
	}
}


/**
 * Sets up the mapping between a {@link Group} and a Slack channel or
 * group. The reverse mapping (for incoming Slack messages) is only set
 * up if the GS instance is responsible for that particular group.
 *
 * @param {string} groupTsid TSID of the group to connect
 * @param {string} cogName Slack channel or group name to connect it to
 * @param {object[]} cogs a list of channel or group objects
 * @private
 */
function connectGroup(groupTsid, cogName, cogs) {
	for (var k in cogs) {
		var cog = cogs[k];
		if (cog.name === cogName) {
			if (cog.is_channel && !cog.is_member) {
				log.error('bot is not a member of #%s', cog.name);
			}
			else if (cog.is_archived) {
				log.error('channel/group %s is archived', cog.name);
			}
			else {
				groupToChannel[groupTsid] = cog;
				if (rpc.isLocal(groupTsid)) {
					channelToGroup[k] = groupTsid;
				}
				break;
			}
		}
	}
}


function onSlackError(err) {
	var msg = 'Slack client error';
	if (typeof err === 'string') {
		log.error('%s: %s', msg, err);
	}
	else {
		log.error({error: err}, msg);
	}
}


/**
 * Handles incoming messages from Slack. Figures out if the message is
 * something we're interested in (regular message sent to one of the
 * connected groups), and forwards it to the respective group if so.
 * @private
 */
function onSlackMessage(msg) {
	log.trace({data: msg}, 'incoming Slack message');
	if (msg.type !== 'message') return;  // ignore meta stuff
	// is this a connected group managed by this GS instance?
	var groupTsid = channelToGroup[msg.channel];
	if (!groupTsid) return;
	// special handling for edits/removals of earlier messages
	if (msg.subtype === 'message_deleted') return;
	if (msg.subtype === 'message_changed' && msg.message) {
		msg = msg.message;  // for edits, message prop seems to contain the actual payload
		msg.text = '[EDIT] ' + msg.text;
	}
	// prepare message payload
	var user = slack.getUserByID(msg.user);
	if (!user) {
		log.error({data: msg}, 'could not retrieve Slack user');
		return;
	}
	var out = {
		type: 'pc_groups_chat',
		tsid: groupTsid,
		pc: {
			tsid: 'PSLACK' + user.id,  // unique pseudo TSID so client assigns different colors
			label: user.name,
		},
		txt: processMsgText(msg.text),
	};
	utils.addNonEnumerable(out, 'fromSlack', true);
	dispatchToGroup(out, function cb(err) {
		if (err) {
			log.error({err: err, data: msg},
				'error dispatching group chat message from Slack');
		}
	});
}


/**
 * Helper for `onSlackMessage`, sends an incoming message from Slack to a group
 * in separate request context.
 * @private
 */
function dispatchToGroup(msg, callback) {
	RQ.getGlobal('persget').push('slackMsg.getGroup',
		pers.get.bind(null, msg.tsid),
		function cb(err, group) {
			if (err) callback(err);
			group.getRQ().push('slackMsg.dispatch',
				group.chat_send_msg.bind(group, msg, callback));
		}
	);
}


/**
 * Performs some adjustments on incoming chat messages from Slack
 * (specifically, replaces user/channel/group references with a
 * human-readable equivalent).
 * @private
 */
function processMsgText(text) {
	return text.replace(/<[^>]*>/gi, function replacer(match) {
		var tokens = /<([@#]?)([^\|]+)\|?([^>]*)>/.exec(match);
		// parenthesized substring matches: tokens[1] is the prefix (@ or #),
		// tokens[2] is the ID, and tokens[3] is the label (if available)
		var prefix = tokens[1] ? tokens[1] : '';
		var label = tokens[3];
		if (!label) {
			var id = tokens[2];
			switch (id[0]) {
				case 'U':
					label = slack.getUserByID(id) ? slack.getUserByID(id).name : id;
					break;
				case 'C':
					label = slack.getChannelByID(id) ? slack.getChannelByID(id).name : id;
					break;
				case 'G':
					label = slack.getGroupByID(id) ? slack.getGroupByID(id).name : id;
					break;
				default:
					label = id;
					break;
			}
		}
		return prefix + label;
	});
}


/**
 * Returns a reference to the Slack client (for testing/debugging).
 *
 * @returns {object} reference to the Slack client
 * @private
 */
function getClient() {
	return slack;
}


/**
 * Forwards a group chat message to the Slack channel/group configured
 * for it (if any).
 *
 * @param {object} msg the chat message request (as sent from GSJS to
 *        the clients of players in the group)
 */
function handleGroupMsg(msg) {
	if (msg.type === 'pc_groups_chat' && !msg.fromSlack) {
		var channel = groupToChannel[msg.tsid];
		if (channel) {
			channel.send(util.format('*[%s]* %s', msg.pc.label, msg.txt));
		}
	}
}


/**
 * If Slack integration is configured for the given group, this
 * modifies its function reponsible for generating the list of chat
 * participants (i.e. the output of `/who`) to include Slack users.
 * @private
 */
function patchGroup(group) {
	if (!groupToChannel[group.tsid]) return;
	// monkey patch the function generating /who output
	var orig = group.chat_get_roster_msg;
	utils.addNonEnumerable(group, 'chat_get_roster_msg',
		//jscs:disable requireCamelCaseOrUpperCaseIdentifiers
		function chat_get_roster_msg() {
			var channel = groupToChannel[group.tsid];
			var roster = utils.shallowCopy(group.chat_roster);
			for (var i = 0; i < channel.members.length; i++) {
				var user = slack.getUserByID(channel.members[i]);
				if (user.presence === 'active' && user.id !== slack.self.id) {
					roster[user.id] = {label: user.name + ' (Slack)'};
				}
			}
			return orig.call({chat_roster: roster});
		}
		//jscs:enable requireCamelCaseOrUpperCaseIdentifiers
	);
}
