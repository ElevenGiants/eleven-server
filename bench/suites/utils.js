'use strict';

require('../setup');
var suite = new (require('benchmark')).Suite;
module.exports = suite;


var utils = require('utils');


suite.add('makeTsid', function() {
	utils.makeTsid('X', 'gs01-01');
});
