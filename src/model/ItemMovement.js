'use strict';

var utils = require('utils');

module.exports = ItemMovement;

// Defined statuses from the NPC Movement spec
var MOVE_CB_STATUS = {
	DIR_CHANGE: 1,
	NO_PATH_TO_DEST: 2,
	ARRIVED_NEAR: 3,
	ARRIVED: 4,
	STOP_NEW_MOVE: 5,
	STOP: 6,
};


/**
 * The generic object to handle movement of an item.
 *
 * @param {object} item the item for which movment is being handled
 */
function ItemMovement(item) {
	this.item = item;
}


/**
 * A helper function to get an offset y value from the item.
 *
 * @param {number} y the y value being offset
 * @param {boolean} positive if the offset is positive or negative
 * @returns {number} the new offset y value
 */
ItemMovement.prototype.offsetY = function offsetY(y, positive) {
	var yoff = (this.item.y_offset ? this.item.y_offset : 0);
	if (positive) {
		return y + yoff;
	}
	else {
		return y - yoff;
	}
};


/*
 * A helper function to get the direction an x value is from the item.
 *
 * @param {number} targetX the x target value being inspected
 * @returns {number} 1/-1 depending on the relation between the item.x and
 *                   targetX
 */
ItemMovement.prototype.dirX = function dirX(targetX) {
	return (this.item.x < targetX ? 1 : -1);
};


/*
 * A helper function to get the direction an y value is from the item.
 *
 * @param {number} targetY the y target value being inspected
 * @returns {number} 1/-1 depending on the relation between the offset item.y
 *                   and targetY
 */
ItemMovement.prototype.dirY = function dirY(targetY) {
	return (this.offsetY(this.item.y, false) < targetY ? 1 : -1);
};


/**
 * Internal Movement handling functions
 */

/*
 * Stop existing item movement.
 *
 * @param {object} status the status object sent to the movement callback
 */
ItemMovement.prototype.stopMove = function stopMove(status) {
	var fs = false;
	// First, Halt the timer
	this.item.cancelGsTimer('movementTimer', true);
	// clear the path
	this.path = null;
	// Notify the callback
	if (this.callback) {
		if (this.flags && 'callBackParam' in this.flags) {
			fs = this.callback.call(this.item, this.flags.callBackParam);
		}
		else {
			fs = this.callback.call(this.item, {status: status});
		}
	}
	return fs;
};


/*
 * Check if a movement path crosses a wall.
 *
 * @param {object} nextStep the nextStep object with the information about the
 *                 next step of movement
 * @returns {object|null} the coordinates of where a wall is crossed or null
 *                        if no walls are crossed
 */
ItemMovement.prototype.checkWalls = function checkWalls(nextStep) {
	// Default width and height of 10 ? Is there a better value
	var halfWidth = ('item_width' in this.item) ? this.item.item_width / 2 : 5;
	var height = ('item_height' in this.item) ? this.item.item_height : 10;

	for (var k in this.item.container.geometry.layers.middleground.walls) {
		var wall = this.item.container.geometry.layers.middleground.walls[k];

		if (wall.item_perm === 0) continue;

		// Direction from which we are crossing the wall line
		var crossDir = null;
		if (this.item.x < wall.x && (nextStep.dx + halfWidth) > wall.x) {
			crossDir = -1;
		}
		else if (this.item.x > wall.x && nextStep.dx - halfWidth < wall.x) {
			crossDir = 1;
		}
		if (crossDir && (!wall.item_perm || crossDir === wall.item_perm)) {
			var myY = this.offsetY(this.item.y, true);
			var dy = myY + ((nextStep.dy - myY) *
					(wall.x - this.item.x) / (nextStep.dx - this.item.x));
			// check if lines overlap
			if (((dy - height) <= (wall.y + wall.h) || dy <= (wall.y + wall.h)) &&
				(dy >= wall.y || (dy - height) >= wall.y)) {
				return {x: wall.x + (crossDir * halfWidth), y: dy};
			}
		}
	}
	return null;
};

/*
 * helper for the walking algorithm which handles platform changes
 *
 * @param {number} x x coordinate of the next step of movement
 * @param {number} y y coordinate of the next step of movement
 */
ItemMovement.prototype.findPlatform = function findPlatform(x, y) {
	if (!this.platform) {
		// First look down from the point
		this.platform = this.item.container.geometry.getClosestPlatPoint(x, y, -1).plat;
		if (!this.platform) {
			this.platform = this.item.container.geometry.getClosestPlatPoint(x,
								y, 1).plat;
		}
		if (!this.platform) {
			log.error('Movement Error: Failed to get platform!');
		}
	}
	else {
		/* Find a new platform:
			This logic is great for npcs that are not pathing.
			Once we start building paths then we will need a way to
			specify an up or down platform transision if 2 are allowed
		 */
		this.platform = null;
		var yStep = ('npc_y_step' in this.item) ? this.item.npc_y_step : 32;
		var canFall = ('npc_can_fall' in this.item) ? this.item.npc_can_fall : false;
		var upPoint = null;
		var upPlatform = this.item.container.geometry.getClosestPlatPoint(
			x, y, 1);
		if (upPlatform.plat) upPoint = upPlatform.point.y;
		if (upPoint !== null && Math.abs(upPoint - y) < yStep) {
			this.platform = upPlatform.plat;
		}
		else {
			var downPoint = null;
			var downPlatform = this.item.container.geometry.getClosestPlatPoint(
				x, y, -1);
			if (downPlatform.plat) downPoint = downPlatform.point.y;
			if (downPoint !== null &&
				(canFall || Math.abs(y - downPoint) < yStep)) {
				this.platform = downPlatform.plat;
			}
		}
		if (!this.platform) {
			log.error('Movement: Failed to get next platform!');
		}
	}
};


/*
 * helper for the walking algorithm which handles direction changes
 *
 * @param {number} x x coordinate of destination
 * @param {object} nextStep the nextStep object being built
 */
ItemMovement.prototype.walkingDirection = function walkingDirection(x, nextStep) {
	var dir = this.dirX(x);
	if (dir !== this.facing) {
		if (this.callback) {
			nextStep.fullChanges = this.callback.call(this.item,
							{status: MOVE_CB_STATUS.DIR_CHANGE,
							dir: dir > 0 ? 'right' : 'left'});
		}
		this.facing = dir;
	}
};


/*
 * Movement algorithm for movement upon platforms.
 *
 * @param {object} nextPath the next destination on the path
 * @returns {object} the next step of movment toward the destination
 */
ItemMovement.prototype.moveWalking = function moveWalking(nextPath) {
	var nextStep = {dx: 0, dy: 0, finished: false, forceStop: 0,
		fullChanges: false};

	if (!('npc_walk_speed' in this.item)) {
		log.error('Movement Error: Walking npc has no walk speed: %s',
				this.item.tsid);
		return {forceStop: MOVE_CB_STATUS.ARRIVED};
	}

	this.walkingDirection(nextPath.x, nextStep);

	var step = Math.min(Math.abs(this.item.x - nextPath.x), this.item.npc_walk_speed / 3);
	// calculate X movement
	nextStep.dx = Math.floor(this.item.x + this.facing * step);
	nextStep.dy = this.item.y;
	if (!this.platform) {
		// Initial Platform
		this.findPlatform(nextStep.dx, this.offsetY(this.item.y, true));
	}
	else if (nextStep.dx < this.platform.start.x ||
		     nextStep.dx > this.platform.end.x) {
		var oldPlatform = this.platform;
		var myY = this.offsetY(this.item.y, true);
		this.findPlatform(nextStep.dx, myY);
		if (this.platform === null) {
			this.platform = oldPlatform;
			return {dx: this.item.x, dy: this.item.y, finished: true,
				status: MOVE_CB_STATUS.ARRIVED_NEAR,
				fullChanges: nextStep.fullChanges};
		}
	}
	if (this.platform) {
		var pyoff = (this.item.y_offset ? this.item.y_offset : 0);
		nextStep.dy = utils.pointOnPlat(this.platform, nextStep.dx).y - pyoff;
	}

	var block = this.checkWalls(nextStep);
	if (block) {
		return {dx: block.x, dy: this.item.y, finished: true,
			status: MOVE_CB_STATUS.ARRIVED_NEAR,
			fullChanges: nextStep.fullChanges};
	}

	if (Math.abs(nextPath.x - this.item.x) === 0) {
		nextStep.finished = true;
	}

	return nextStep;
};


/*
 * Helper for butterfly flying. Builds the next run in the flight box
 *
 * @param {object} nextPath nextPath object defining the flight box
 */
ItemMovement.prototype.nextFlightPath = function nextFlightPath(nextPath) {
	var xVariation = Math.random() * (nextPath.width / 4);
	if (!('x' in nextPath)) {
		if (Math.random() < 0.5) {
			nextPath.x = Math.round(nextPath.left + xVariation);
		}
		else {
			nextPath.x = Math.round(nextPath.right - xVariation);
		}
	}
	else if (this.item.x === nextPath.x) {
		var dLeft = Math.abs(this.item.x - nextPath.left);
		var dRight = Math.abs(this.item.x - nextPath.right);
		if (dRight < dLeft) {
			nextPath.x = Math.round(nextPath.left + xVariation);
		}
		else {
			nextPath.x = Math.round(nextPath.right - xVariation);
		}
	}
	nextPath.y = Math.round(nextPath.top + (Math.random() * nextPath.height));
};


/*
 * Helper for butterfly flying. Sets the butterfly state
 *
 * @param {number} x x location of destination
 * @param {number} y y location of destination
 * @param {number} dir direction of destination
 */
ItemMovement.prototype.changeState = function changeState(x, y, dir) {
	if (this.flags && 'changeState' in this.flags &&
		this.flags.changeState) {
		this.item.state = 'fly';
		if (x < 10 && y < 10) {
			this.item.state += '-top';
		}
		else if (x > (y * 2)) {
			this.item.state += '-side';
		}
		else if (x > y) {
			this.item.state += '-angle1';
		}
		else {
			this.item.state += '-angle2';
		}

		if (dir > 0) {
			this.item.dir = 'right';
		}
		else {
			this.item.dir = 'left';
		}
	}
};


/**
 * Movement algorithm for butterfly style flying.
 *
 * @param {object} nextPath the next destination on the path
 * @returns {object} the next step of movment toward the destination
 */
ItemMovement.prototype.moveFlying = function moveFlying(nextPath) {
	var nextStep = {dx: 0, dy: 0, finished: false, forceStop: 0};

	if (nextPath.stopAtEnd && (this.item.x === nextPath.x &&
		(this.offsetY(this.item.y, false)) === nextPath.y)) {
		return {forceStop: MOVE_CB_STATUS.ARRIVED};
	}

	if (!('x' in nextPath) || (this.item.x === nextPath.x)) {
		this.nextFlightPath(nextPath);
	}

	var dir = this.dirX(nextPath.x);
	var dirY = this.dirY(nextPath.y);
	var dX = Math.abs(this.item.x - nextPath.x);
	var dY = Math.abs(this.offsetY(this.item.y, false) - nextPath.y);

	// A touch of randomization to the y movement
	if ('height' in nextPath) {
		dY = dY + (Math.random() * (nextPath.height / 2)) - (nextPath.height / 4);
	}

	this.changeState(dX, dY, dir);

	var limit;
	if (Math.abs(dX) < 1 && Math.abs(dY) < 1) {
		limit = 1;
	}
	else {
		limit = (nextPath.speed / 3) / Math.sqrt((dX * dX) + (dY * dY));
	}
	if (limit < 1) {
		nextStep.dy = this.offsetY(this.item.y, false) + (dirY * dY * limit);
		nextStep.dx = this.item.x + (dir * dX * limit);
	}
	else {
		nextStep.dy = this.offsetY(nextPath.y, false);
		nextStep.dx = nextPath.x;
	}

	if (nextPath.stopAtEnd && (nextStep.dx === nextPath.x &&
		(nextStep.dy === this.offsetY(nextPath.y, false)))) {
		nextStep.finished = true;
	}

	return nextStep;
};


/**
 * Movement algorithm for direct movement.
 *
 * @param {object} nextPath the next destination on the path
 * @returns {object} the next step of movment toward the destination
 */
ItemMovement.prototype.moveDirect = function moveDirect(nextPath) {
	var nextStep = {dx: 0, dy: 0, finished: false, forceStop: 0};

	if (this.item.x === nextPath.x &&
		this.offsetY(this.item.y, false) === nextPath.y) {
		nextStep.forceStop = MOVE_CB_STATUS.ARRIVED;
		return nextStep;
	}

	var dir = this.dirX(nextPath.x);
	var dirY = this.dirY(nextPath.y);
	var dX = Math.abs(this.item.x - nextPath.x);
	var dY = Math.abs(this.offsetY(this.item.y, false) - nextPath.y);

	var limit;
	if (Math.abs(dX) < 1 && Math.abs(dY) < 1) {
		limit = 1;
	}
	else {
		limit = (nextPath.speed / 3) / Math.sqrt((dX * dX) + (dY * dY));
	}
	if (limit < 1) {
		nextStep.dy = this.offsetY(this.item.y, false) + (dirY * dY * limit);
		nextStep.dx = this.item.x + (dir * dX * limit);
	}
	else {
		nextStep.dy = this.offsetY(nextPath.y, false);
		nextStep.dx = nextPath.x;
	}

	if (nextStep.dx === nextPath.x &&
		(nextStep.dy === this.offsetY(nextPath.y, false))) {
		nextStep.finished = true;
	}

	return nextStep;
};

/**
 * Moves the item via the transportation dictated in the next path point
 *
 * @param {object} nextPath the next pathing target
 * @returns {object} the next step in the path
 */
ItemMovement.prototype.transport = function transport(nextPath) {
	switch (nextPath.transport)
	{
		case 'walking':
			return this.moveWalking(nextPath);
		case 'flying':
			return this.moveFlying(nextPath);
		case 'direct':
			return this.moveDirect(nextPath);
		default:
			return undefined;
	}
};

/**
 * Moves the item a step along its path.
 * This is the core function that exists in the timer loop.
 *
 * @returns {boolean} true
 */
ItemMovement.prototype.moveStep = function moveStep() {
	// Sanity checking, this should not occur
	if (!this.path || this.path.length === 0) {
		log.error('Pathing Error: Moving but no path information. %s', this.item);
		this.stopMove(MOVE_CB_STATUS.ARRIVED);
		return true;
	}

	var nextStep = this.transport(this.path[0]);

	if (nextStep && !nextStep.forceStop) {
		this.item.setXY(nextStep.dx, nextStep.dy);
		// Announce changes
		this.item.queueChanges(false, nextStep.fullChanges);
		this.item.container.send({type: 'location_event'});
		if (nextStep.finished) {
			this.path.shift();
		}
	}
	else if (nextStep && nextStep.forceStop) {
		if (this.stopMove(nextStep.forceStop)) {
			this.item.queueChanges(false, true);
		}
		return true;
	}
	else {
		this.path.shift();
	}

	if (this.path.length === 0) {
		if (nextStep && nextStep.status) {
			if (this.stopMove(nextStep.status)) {
				this.item.queueChanges(false, true);
			}
		}
		else {
			if (this.stopMove(MOVE_CB_STATUS.ARRIVED)) {
				this.item.queueChanges(false, true);
			}
		}
		return true;
	}

	return true;
};

/**
 * Builds the path for an item.
 *
 * @param {string} transport the transport type for the movement
 * @param {object} dest destination for the movement
 * @param {object} options options passed into movement
 * @returns {object} the pathing object for the movement
 */
ItemMovement.prototype.buildPath = function buildPath(transport, dest, options) {
	var path;
	if (transport === 'walking') {
		//TODO: Actual pathing
		path = [
			{x: dest.x, y: dest.y, transport: 'walking'}
		];
	}
	else if (transport === 'direct') {
	// Build a streight line movement path
		path = [
			{x: dest.x,
			 y: dest.y,
			 speed: options.speed,
			 transport: 'direct'}
		];
	}
	else if (transport === 'flying') {
		if (!options.stopAtEnd) {
			path = [
			 {left: dest.left,
			  right: dest.right,
			  width: dest.width,
			  top: dest.top,
			  height: dest.height,
			  speed: options.speed,
			  stopAtEnd: false,
			  transport: 'flying'}
			];
		}
		else {
			path = [
			 {x: dest.x,
			  y: dest.y,
			  speed: options.speed,
			  stopAtEnd: true,
			  transport: 'flying'}
			];
		}
	}
	else if (transport === 'kicked') {
		path = [
			 {x: this.item.x + options.vx,
			  y: this.item.y + options.vy,
			  speed: 90,
			  stopAtEnd: true,
			  transport: 'flying'},
			 {x: this.item.x + (2 * options.vx),
			  y: this.item.y + options.vy,
			  speed: (this.kickVx >= 9) ? Math.abs(this.kickVx / 3) : 3,
			  stopAtEnd: true,
			  transport: 'flying'}
		];
		var tx = this.item.x + (3 * this.kickVx);
		var ty;
		var platform = this.item.container.geometry.getClosestPlatPoint(tx,
			(this.item.y + options.vy), -1).plat;
		if (!platform) {
			log.error('Failed to find landing platform');
			if ('groundY' in this.item.container.geo) {
				ty = this.item.container.geo.groundY;
			}
			else {
				ty = this.item.container.geo.b;
			}
		}
		else {
			ty = utils.pointOnPlat(platform, tx).y;
		}
		path.push({x: tx, y: ty, speed: 90, stopAtEnd: true,
			  transport: 'flying'});
	}
	return path;
};



/**
 * These are functions that will be called by the base Item to envoke
 * movement.
 */

/**
 * An item has gotten a movement request.
 *
 * @param {string} transport the transportation for this movement
 * @param {object} dest destination for the movement
 * @param {object} options for this movement
 * @returns {boolean} true if movement is possible and started
*/
ItemMovement.prototype.startMove = function startMove(transport, dest, options) {
	if (this.path) {
		this.stopMove(MOVE_CB_STATUS.STOP_NEW_MOVE);
	}
	this.flags = options;
	if ('callback' in options) {
		this.callback = this.item[options.callback];
	}
	this.facing = 0; // unset
	if (options.path) {
		this.path = options.path;
	}
	else {
		this.path = this.buildPath(transport, dest, options);
	}
	this.moveStep();
	// Check if we are stuck, i.e. completely unable to move.
	if (!this.path || this.path.length === 0) {
		return false;
	}
	this.item.setGsTimer({fname: 'movementTimer', delay: 333, interval: true,
		internal: true});
	return true;
};

/*
 * Stop item movement.
 */
ItemMovement.prototype.stopMovement = function stopMovement() {
	this.stopMove(MOVE_CB_STATUS.STOP);
};
