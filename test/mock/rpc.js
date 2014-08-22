// public interface
module.exports = {
	reset: reset,
	isLocal: isLocal,
	makeProxy: makeProxy,
	sendRequest: sendRequest,
	getRequests: getRequests,
};


var local = true;
var requests = [];


function reset(loc) {
	local = !!loc;
	requests = [];
}


function isLocal(obj) {
	return local;
}


function makeProxy(obj) {
	obj.__isRP = true;
	return obj;
}


function sendRequest(obj, fname, args) {
	requests.push({obj: obj, fname: fname, args: args});
	return obj[fname].apply(obj, args);
}


function getRequests() {
	return requests;
}
