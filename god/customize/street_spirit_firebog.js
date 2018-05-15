exports.schemaOverride = {
	properties: {
		instanceProps: {
			properties: {
				skull: {
					'default': '',
					required: false,
				},
				eyes: {
					'default': '',
					required: false,
				},
				top: {
					'default': '',
					required: false,
				},
				bottom: {
					'default': '',
					required: false,
				},
				base: {
					'default': '',
					required: false,
				},
			},
		},
	},
};


exports.optionsOverride = {
	fields: {
		instanceProps: {
			fields: {
				skull: {
					removeDefaultNone: false,
					hidden: true,
				},
				eyes: {
					removeDefaultNone: false,
					hidden: true,
				},
				top: {
					removeDefaultNone: false,
					hidden: true,
				},
				bottom: {
					removeDefaultNone: false,
					hidden: true,
				},
				base: {
					removeDefaultNone: false,
					hidden: true,
				},
			},
		},
	},
};
