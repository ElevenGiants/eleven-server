var pers = require('../../persistence/pers');


exports.customizeSchema = function(obj, schema) {
	var loc = pers.get(obj.tcont);
	var locEvents = Object.keys(loc.events);
	for (var k in schema.properties.instanceProps.properties) {
		if (k === 'onEnter' || k === 'onExit' || k === 'onTimer') {
			schema.properties.instanceProps.properties[k]['enum'] = locEvents;
		}
	}
	return schema;
};


exports.customizeOptions = function(obj, options) {
	for (var k in obj.instanceProps) {
		// make event choice fields select boxes (radio buttons/checkboxes
		// don't reliably show the current value)
		if (k === 'onEnter' || k === 'onExit' || k === 'onTimer' || k === 'timer_fire') {
			options.fields.instanceProps.fields[k] = {
				type: 'select',
			};
		}
	}
	return options;
};
