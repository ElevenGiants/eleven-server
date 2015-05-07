'use strict';

var rewire = require('rewire');
var slackNotify = rewire('comm/slackNotify');


suite('slackNotify', function () {

	suite('send', function () {

		setup(function () {
			slackNotify.__set__('cfg', {
				webhookUrl: 'https://hooks.slack.com/services/FOO/bar',
				channel: 'server-admins-test',
				botName: 'gameserver TEST',
			});
		});

		teardown(function () {
			slackNotify.__set__('cfg', undefined);
		});


		test('formats messages', function (done) {
			slackNotify.__set__('slack', {webhook: function webhook(params) {
				assert.strictEqual(params.text, ':rotating_light: meebleforp!');
				done();
			}});
			slackNotify.alert('%sble%s!', 'mee', 'forp');
			slackNotify.__set__('slack', undefined);  // clean up
		});

		test('sends message without icon correctly', function (done) {
			slackNotify.__set__('slack', {webhook: function webhook(params) {
				assert.strictEqual(params.text, 'aaargh');
				done();
			}});
			slackNotify.__get__('send')(['aaargh']);
			slackNotify.__set__('slack', undefined);  // clean up
		});

		test('uses default parameters defined in config', function (done) {
			slackNotify.__set__('slack', {webhook: function webhook(params) {
				// config options defined in test setup
				assert.strictEqual(params.channel, 'server-admins-test');
				assert.strictEqual(params.username, 'gameserver TEST (gs01-01)');
				done();
			}});
			slackNotify.info('I am Professor Chaos!');
			slackNotify.__set__('slack', undefined);  // clean up
		});

		test('handles optional custom channel argument', function (done) {
			slackNotify.__set__('slack', {webhook: function webhook(params) {
				assert.strictEqual(params.channel, 'gswarnings');
				assert.strictEqual(params.text, ':warning: something happened');
				done();
			}});
			slackNotify.warning({channel: 'gswarnings'}, 'something %s', 'happened');
			slackNotify.__set__('slack', undefined);  // clean up
		});

		test('does not fail when integration is not configured', function () {
			slackNotify.__set__('cfg', undefined);
			slackNotify.__set__('slack', {webhook: function webhook(params) {
				throw new Error('should not be called');
			}});
			slackNotify.alert('meep');
			slackNotify.__set__('slack', undefined);  // clean up
		});
	});
});
