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
				benefit: {
					hidden: true,
				},
				benefit_ceil: {
					hidden: true,
				},
				benefit_floor: {
					hidden: true,
				},
				is_random: {
					hidden: true,
				},
				location_event_id: {
					hidden: true,
				},
				marker: {
					hidden: true,
				},
				owner: {
					hidden: true,
				},
				respawn_time: {
					hidden: true,
				},
				uses_remaining: {
					hidden: true,
				},
			},
		},
		state: {
			hidden: true,
		},
		spawned: {
			hidden: true,
		},
		only_visible_to: {
			hidden: true,
		},
		isHidden: {
			hidden: true,
		},
	},
}
exports.schemaOrder = {
	instanceProps: {_self: ['class_name', 'type', 'giant']},
}
