exports.optionsOverride = {
	fields: {
		players: {hidden: true},
		items: {hidden: true},
		action_requests: {hidden: true},
		delayed_sounds: {hidden: true},
		emotes: {hidden: true},
		greeters_summoned: {hidden: true},
		hi_sign_daily_evasion_record: {hidden: true},
		hi_sign_evasion_record: {hidden: true},
		hi_sign_evasion_record_history: {hidden: true},
		incantations: {hidden: true},
		incantations_redux: {hidden: true},
		incantations_redux_step: {hidden: true},
		jobs: {hidden: true},
		jobs_is_locked: {hidden: true},
		qurazy: {hidden: true},
		streaking_increments: {hidden: true},
		stun_orbs: {hidden: true},
		rook_status: {
			lazyLoading: false,
		},
		keys: {
			lazyLoading: false,
		},
		class_tsid: {hidden: false},
		label: {hidden: false},
	},
}


exports.schemaOrder = {
	_self: ['label', 'class_tsid', 'hubid', 'moteid', 'template', 'upgrade_template', 'upgrade_level', 'old_upgrade_tree', 'rook_status', 'keys', 'image', 'loading_image'],
	image: {_self: ['w', 'h', 'url']},
	loading_image: {_self: ['w', 'h', 'url']},
}
