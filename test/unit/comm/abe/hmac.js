'use strict';

var token = require('token');
var abeHmac = require('comm/abe/hmac');
var auth = require('comm/auth');
var Player = require('model/Player');


suite('hmac', function () {

	var origOpts;

	setup(function () {
		origOpts = token.defaults;
		abeHmac.init({
			secret: 'topsecret',
			timeStep: 60,
		});
	});

	teardown(function () {
		token.defaults = origOpts;
	});


	suite('getToken', function () {

		test('returns a string with the expected layout', function () {
			var p = new Player({tsid: 'PXYZ'});
			var t = abeHmac.getToken(p);
			assert.strictEqual(t.split('|').length, 2);
			assert.strictEqual(t.split('|')[0], 'PXYZ');
		});
	});


	suite('authenticate', function () {

		test('does its job', function () {
			var tdata = abeHmac.getToken(new Player({tsid: 'PTHEDUDE'}));
			assert.strictEqual(abeHmac.authenticate(tdata), 'PTHEDUDE');
		});

		test('accepts tokens from the near future', function () {
			// timeStep is defined as 60 seconds above; create a token set 30s in the future
			var tdata = abeHmac.getToken(new Player({tsid: 'PTHEDUDE'}),
				{now: new Date().getTime() + 30000});
			assert.strictEqual(abeHmac.authenticate(tdata), 'PTHEDUDE');
		});

		test('throws AuthError for expired tokens', function () {
			assert.throw(function () {
				var tdata = abeHmac.getToken(new Player({tsid: 'PTHEDUDE'}),
					{now: new Date().getTime() - 120000});
				abeHmac.authenticate(tdata);
			}, auth.AuthError);
		});

		test('throws AuthError on invalid token data', function () {
			assert.throw(function () {
				abeHmac.authenticate('THIS|ISNOTATOKEN');
			}, auth.AuthError);
		});
	});
});
