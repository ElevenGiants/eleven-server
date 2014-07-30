// public interface
module.exports = {
	setLocal: setLocal,
	isLocal: isLocal,
	makeProxy: makeProxy,
};


var local = true;


function setLocal(val) {
	local = !!val;
}


function isLocal(obj) {
	return local;
}


function makeProxy(obj) {
	obj.__isRP = true;
	return obj;
}
