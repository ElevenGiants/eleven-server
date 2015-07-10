'use strict';

var gsjsBridge = require('model/gsjsBridge');


// public interface
module.exports = {
	create: create,
	isTsid: gsjsBridge.isTsid,
};


function create(data, modelType) {
	if (modelType) {
		/*jshint -W055 */  // ignore lowercase constructor names here
		return new modelType(data);
		/*jshint +W055 */
	}
	return data;
}
