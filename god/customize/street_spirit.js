exports.schemaOverride = {
	properties: {
		instanceProps: {
			properties: {
				store_id: {
					type: 'integer',
					'enum': [0, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25],
					'default': '0',
				},
				top: {
					required: false,
				},
				bottom: {
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
				store_id: {
					optionLabels: [
						'none',
						'Produce',
						'Hardware',
						'Sno Cone',
						'Gardening Goods',
						'Kitchen',
						'Groceries',
						'Alchemical',
						'Animal',
						'Tool',
						'Gardening Tools',
						'Uncle Friendly',
						'Cooking',
						'Helga',
						'Meal',
						'Bureacracy',
						'Mining',
						'Toy',
						'Ticket Dispenser',
						'Bags Only',
						'Fox Ranger',
						'Furniture',
						'Bags Small & Large',
						'Extremely Rare Items',
					],
				},
				top: {
					removeDefaultNone: false,
				},
				bottom: {
					removeDefaultNone: false,
				},
			},
		},
		loneliness: {
			hidden: true,
		},
		state_stack: {
			hidden: true,
		},
		message_queue: {
			hidden: true,
		},
		message_interval: {
			hidden: true,
		},
		message_handlers: {
			hidden: true,
		},
		waitingFor: {
			hidden: true,
		},
		song_lines: {
			hidden: true,
		},
		available_quests: {
			hidden: true,
		},
		npc_can_climb: {
			hidden: true,
		},
		npc_can_fall: {
			hidden: true,
		},
		npc_can_jump: {
			hidden: true,
		},
		npc_can_walk: {
			hidden: true,
		},
		npc_climb_speed: {
			hidden: true,
		},
		npc_jump_height: {
			hidden: true,
		},
		npc_walk_speed: {
			hidden: true,
		},
	},
};
