'use strict';

var rewire = require('rewire');
var slack = rewire('comm/slack');


suite('slack', function () {


	suite('processMsgText', function () {

		var processMsgText = slack.__get__('processMsgText');

		test('replaces user and channel references with names', function () {
			assert.strictEqual(processMsgText(
				'test <@U024H9SL6|aroha> <#C024H4M2X|general>x'),
				'test @aroha #generalx');
		});

		test('gets missing user/group/channel labels from slack client', function () {
			slack.__set__('slack', {
				getUserByID: function getUserByID(id) {
					return {name: id.toLowerCase()};
				},
				getChannelByID: function getChannelByID(id) {
					return;  // fake unknown channel/group
				},
			});
			assert.strictEqual(processMsgText(
				'emptylabel <@U024H9SL6|> nolabel <#C024H4M2X>'),
				'emptylabel @u024h9sl6 nolabel #C024H4M2X');
			slack.__set__('slack', undefined);  // clean up
		});
	});
});
