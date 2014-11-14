'use strict';

var gsjsBridge = require('model/gsjsBridge');


// public interface
module.exports = {
	create: create,
	isTsid: gsjsBridge.isTsid,
};


function create(data) {
	return data;
}
