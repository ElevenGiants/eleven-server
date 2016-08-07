'use strict';

var _ = require('lodash');
var rewire = require('rewire');
var slackChat = rewire('comm/slackChat');


suite('slackChat', function () {


	suite('processMsgText', function () {

		var processMsgText = slackChat.__get__('processMsgText');

		test('replaces user and channel references with names', function () {
			assert.strictEqual(processMsgText(
				'test <@U024H9SL6|aroha> <#C024H4M2X|general>x'),
				'test @aroha #generalx');
		});

		test('gets missing user/group/channel labels from slack client', function () {
			slackChat.__set__('slack', {dataStore: {
				getUserById: function getUserById(id) {
					return {name: id.toLowerCase()};
				},
				getChannelById: function getChannelById(id) {
					return;  // fake unknown channel/group
				},
			}});
			assert.strictEqual(processMsgText(
				'emptylabel <@U024H9SL6|> nolabel <#C024H4M2X>'),
				'emptylabel @u024h9sl6 nolabel #C024H4M2X');
			slackChat.__set__('slack', undefined);  // clean up
		});
	});


	suite('onSlackMessage', function () {

		setup(function () {
			slackChat.__set__('channelToGroup', {C037FB4HV: 'GXYZ'});
			slackChat.__set__('slack', {dataStore: {
				getUserById: function getUserByIDStub(id) {
					return {id: 'PASDF', name: 'D. Ummy User'};
				},
			}});
		});

		teardown(function () {
			slackChat.__set__('channelToGroup', {});
			slackChat.__set__('slack', undefined);
		});

		var onSlackMessage = slackChat.__get__('onSlackMessage');

		test('works as expected', function (done) {
			var dispatchToGroup = slackChat.__get__('dispatchToGroup');
			slackChat.__set__('dispatchToGroup', function dispatchToGroupStub(msg) {
				assert.deepEqual(msg, {
					type: 'pc_groups_chat',
					tsid: 'GXYZ',
					pc: {tsid: 'PSLACKPASDF', label: 'D. Ummy User'},
					txt: 'this is a message that was posted in Slack',
				});
				assert.isTrue(msg.fromSlack);
				return done();
			});
			onSlackMessage({
				type: 'message',
				channel: 'C037FB4HV',
				user: 'U024H9SL6',
				text: 'this is a message that was posted in Slack',
				ts: '1452279130.000011',
				team: 'T024H4M2R',
			});
			slackChat.__set__('dispatchToGroup', dispatchToGroup);
		});

		test('handles missing user', function () {
			// for unknown reasons, the Slack lib sometimes does not return a
			// user; simulate this
			slackChat.__set__('slack', {dataStore: {
				getUserById: _.noop,
			}});
			onSlackMessage({
				type: 'message',
				channel: 'C037FB4HV',
				user: 'U024H9SL6',
				text: 'barf',
			});
			// nothing specific to check, it just shouldn't throw an error
		});
	});
});
