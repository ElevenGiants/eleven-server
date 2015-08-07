'use strict';

/**
 * Functions for sending notifications/alerts to Slack (using
 * {@link https://api.slack.com/incoming-webhooks|incoming WebHooks}).
 *
 * @module
 */

// public interface
module.exports = {
	init: init,
	info: info,
	warning: warning,
	alert: alert,
};

var config = require('config');
var Slack = require('slack-node');
var util = require('util');

var cfg;
var slack;


function init() {
	slack = new Slack();
	cfg = config.get('slack:notify');
	slack.setWebhook(cfg.webhookUrl);
}


/**
 * Sends an informational message to Slack.
 *
 * @param {object} [options] can be used to override default webhook
 *        options from the GS config
 * @param {string} [options.channel] custom Slack channel (or user or
 *        group) to send the message to
 * @param {string} msg the message to send (may contain placeholders,
 *        processed by `util.format`)
 * @param {...string} [vals] values for the placeholders in `msg`
 */
function info(options, msg) {
	send(arguments, ':white_check_mark:');
}


/**
 * Sends a warning message to Slack.
 *
 * @param {object} [options] can be used to override default webhook
 *        options from the GS config
 * @param {string} [options.channel] custom Slack channel (or user or
 *        group) to send the message to
 * @param {string} msg the message to send (may contain placeholders,
 *        processed by `util.format`)
 * @param {...string} [vals] values for the placeholders in `msg`
 */
function warning(options, msg) {
	send(arguments, ':warning:');
}


/**
 * Sends an alert message to Slack.
 *
 * @param {object} [options] can be used to override default webhook
 *        options from the GS config
 * @param {string} [options.channel] custom Slack channel (or user or
 *        group) to send the message to
 * @param {string} msg the message to send (may contain placeholders,
 *        processed by `util.format`)
 * @param {...string} [vals] values for the placeholders in `msg`
 */
function alert(options, msg) {
	send(arguments, ':rotating_light:');
}


/**
 * Sends a message to a Slack incoming WebHook (if the respective
 * integration is configured).
 *
 * @param {array} args webhook call payload: one or more string
 *        elements that will be formatted through `util.format`, and
 *        optionally a leading `object` type element that may contain
 *        a custom `channel` to send the message to
 * @param {string} [icon] an optional prefix for the message (typically
 *        an emoji like `:warning:`)
 * @private
 */
function send(args, icon) {
	if (!cfg) {
		log.debug({args: args}, 'Slack webhook call skipped (not configured)');
		return;
	}
	var webhookParams = {
		icon_emoji: ':bcroc:',
		username: util.format('%s (%s)', cfg.botName, config.getGsid()),
		channel: cfg.channel,
	};
	// function parameter handling
	if (typeof args[0] === 'object' && args[0] !== null) {
		webhookParams.channel = args[0].channel || webhookParams.channel;
		args = Array.prototype.slice.call(args, 1);
	}
	// format message content
	var text = util.format.apply(null, args);
	if (typeof icon === 'string' && icon.length) {
		text = util.format('%s %s', icon, text);
	}
	webhookParams.text = text;
	// invoke webhook
	log.debug(webhookParams, 'calling Slack webhook');
	slack.webhook(webhookParams, function callback(err, res) {
		if (err) {
			log.error(err, 'failed to call Slack webhook');
		}
	});
}

