exports.schemaOverride = {
	properties: {
		instanceProps: {
			properties: {
				is_random: {
					'enum': ['0', '1'],
					'default': '0',
					// hide the description (labels defined in custom options are descriptive)
					description: undefined,
				},
				type: {
					description: undefined,  // name is obvious enough
				},
			},
		},
	},
}


exports.optionsOverride = {
	fields: {
		instanceProps: {
			fields: {
				is_random: {
					optionLabels: {
						'0': 'no',
						'1': 'yes',
					}
				},
			},
		},
	},
}
