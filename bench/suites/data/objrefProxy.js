'use strict';

require('../../setup');
var suite = new (require('benchmark')).Suite;
module.exports = suite;
var orproxy = require('data/objrefProxy');


function getSampleObj() {
	return {
		a: {
			aa: {
				objref: true,
				tsid: 'IAA',
				label: 'blah',
			},
			ab: {
				objref: true,
				tsid: 'IAB',
				label: 'blah',
			},
		},
		b: {
			ba: {
				noObjref: true,
			},
			bb: {
				objref: true,
				tsid: 'IBB',
				label: 'blah',
			}
		},
	};
};

var proxiedSampleObj = getSampleObj();
orproxy.proxify(proxiedSampleObj);


suite.add('proxify', function() {
	orproxy.proxify(getSampleObj());
}, {
	//minTime: 50,
});

suite.add('refify', function() {
	orproxy.refify(proxiedSampleObj);
});
