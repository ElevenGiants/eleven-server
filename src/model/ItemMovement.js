'use strict';

var utils = require('utils');
var NpcMovementError = require('errors').NpcMovementError;

module.exports = ItemMovement;


// callback status codes from the NPC movement spec
var MOVE_CB_STATUS = {
	DIR_CHANGE: 1,
	NO_PATH_TO_DEST: 2,
	ARRIVED_NEAR: 3,
	ARRIVED: 4,
	STOP_NEW_MOVE: 5,
	STOP: 6,
};

// parameters for flocking (squared to avoid unnecessary square root calculations):
// how close does an NPC need to be to be considered part of a flock
var FLOCK_RADIUS_SQUARED = 400 * 400;
// what distance from each other do flock members try to maintain
var FLOCK_REPEL_DIST_SQUARED = 100 * 100;


/**
 * Helper class handling movement for moving items (NPCs) according to
 * the {@link http://www.iamcal.com/files/npcms.htm|NPC movement spec}.
 *
 * An instance of this class is created for an item on demand/when
 * necessary (see {@link Item#gsStartMoving}).
 *
 * At the highest level, movement is processed like this:
 * * a movement API function calls {@link
 *   ItemMovement#startMove|startMove}
 * * `startMove` calls {@link ItemMovement#buildPath|buildPath} to
 *   create a movement path (which may consist of multiple segments)
 * * `startMove` makes the first `moveStep` call, initiating movement
 * * {@link ItemMovement#moveStep|moveStep}
 *   * calls the movement handler function for the selected
 *     movement type ({@link ItemMovement#moveWalking|moveWalking},
 *     {@link ItemMovement#moveFlying|moveFlying}, {@link
 *     ItemMovement#moveDirect|moveDirect})
 *   * updates the item position according to the results
 *   * switches to the next path segment when necessary
 *   * sets up a timer to call itself again, or ends the move
 * * any relevant events occurring during the move are sent to the
 *   defined movement callback handler
 *
 * @param {Item} item the item for which movment is being handled
 * @constructor
 */
function ItemMovement(item) {
	this.item = item;
	// initialize with previous parameters after deserialization, if applicable
	if (item.gsMovement) {
		Object.keys(item.gsMovement).forEach(function set(k) {
			this[k] = item.gsMovement[k];
		}, this);
	}
}


/**
 * Helper function for container geometry access.
 * @private
 */
ItemMovement.prototype.getGeo = function getGeo() {
	return this.item.container.geometry;
};


/**
 * Converts vertical item coordinates between actual item position and
 * corresponding platform position; this is relevant for items with a
 * non-zero `y_offset` property like hovering street spirits.
 *
 * @param {number} y the source y value
 * @param {boolean} add whether offset should be added (`true`, for
 *        converting from item to platform y) or subtracted (`false`,
 *        converting platform to item y)
 * @returns {number} the converted y value
 * @private
 */
ItemMovement.prototype.offsetY = function offsetY(y, add) {
	var yoff = this.item.y_offset ? this.item.y_offset : 0;
	return add ? y + yoff : y - yoff;
};


/**
 * Determines the direction of a horizontal coordinate in relation to
 * the item.
 *
 * @param {number} targetX the x value being inspected
 * @returns {number} 1 (`targetX` is to the right of the item) or -1
 *          (`targetX` is to the left)
 * @private
 */
ItemMovement.prototype.dirX = function dirX(targetX) {
	return this.item.x < targetX ? 1 : -1;
};


/**
 * Determines the direction of a vertical coordinate in relation to
 * the item.
 *
 * @param {number} targetY the y value being inspected
 * @returns {number} 1 (`targetY` is below the item) or -1 (`targetY`
 *          is above)
 * @private
 */
ItemMovement.prototype.dirY = function dirY(targetY) {
	return this.item.y < targetY ? 1 : -1;
};


/**
 * Stops any item movement.
 *
 * @param {number} status the status code sent to the movement callback
 * @param {boolean} [queueChanges] if `true`, queue item changes to be
 *        sent to players in the location
 */
ItemMovement.prototype.stopMove = function stopMove(status, queueChanges) {
	if (!status) status = MOVE_CB_STATUS.STOP;
	var fullStatus = false;
	this.item.cancelGsTimer('movementTimer');
	// clear the path
	this.path = null;
	// notify the callback
	if (this.callback) {
		if (this.options && 'callbackParam' in this.options) {
			fullStatus = this.callback.call(this.item, this.options.callbackParam);
		}
		else {
			fullStatus = this.callback.call(this.item, {status: status});
		}
	}
	if (queueChanges) {
		this.item.queueChanges(false, !fullStatus);
	}
};


/**
 * Checks if the item is currently moving.
 *
 * @returns {boolean} `true` if the item is moving
 */
ItemMovement.prototype.isMoving = function isMoving() {
	return this.item.gsTimerExists('movementTimer');
};


/**
 * Checks if a movement path crosses a wall.
 *
 * @param {object} nextStep an object containing information about the
 *        next movement step (see {@link ItemMovement#moveWalking})
 * @returns {object|undefined} the coordinates of where a wall is
 *          crossed, or `undefined` if no walls are crossed
 * @private
 */
ItemMovement.prototype.checkWalls = function checkWalls(nextStep) {
	// default width and height of 10px (TODO: is there a better value?)
	var halfWidth = 'item_width' in this.item ? this.item.item_width / 2 : 5;
	var height = 'item_height' in this.item ? this.item.item_height : 10;

	for (var k in this.getGeo().layers.middleground.walls) {
		var wall = this.getGeo().layers.middleground.walls[k];
		if (wall.item_perm === 0) continue;

		// direction from which we are crossing the wall line
		var crossDir = null;
		if (this.item.x < wall.x && nextStep.dx + halfWidth > wall.x) {
			crossDir = -1;
		}
		else if (this.item.x > wall.x && nextStep.dx - halfWidth < wall.x) {
			crossDir = 1;
		}
		if (crossDir && (!wall.item_perm || crossDir === wall.item_perm)) {
			var myY = this.offsetY(this.item.y, true);
			var dy = myY + (nextStep.dy - myY) *
					(wall.x - this.item.x) / (nextStep.dx - this.item.x);
			// check if lines overlap
			if ((dy - height <= wall.y + wall.h || dy <= wall.y + wall.h) &&
				(dy >= wall.y || dy - height >= wall.y)) {
				return {x: wall.x + crossDir * halfWidth, y: dy};
			}
		}
	}
};


/**
 * Helper for handling platform changes for {@link ItemMovement#moveWalking}.
 * Sets the `platform` member to the appropriate geometry platform for
 * the destination of the next movement step.
 *
 * @param {number} x x coordinate of the next step
 * @param {number} y y coordinate of the next step
 * @private
 */
ItemMovement.prototype.findPlatform = function findPlatform(x, y) {
	if (!this.platform) {
		// first look below the given point
		this.platform = this.getGeo().getClosestPlatPoint(x, y, -1).plat;
		if (!this.platform) {  // then above
			this.platform = this.getGeo().getClosestPlatPoint(x, y, 1).plat;
		}
		if (!this.platform) {
			throw new NpcMovementError(this, 'failed to find initial platform',
				{dx: x, dy: y});
		}
	}
	else {
		// Find a new platform:
		// This logic is great for NPCs that are not pathing.
		// Once we start building paths then we will need a way to
		// specify an up or down platform transition if both are allowed
		this.platform = null;
		var yStep = 'npc_y_step' in this.item ? this.item.npc_y_step : 32;
		var canFall = 'npc_can_fall' in this.item ? this.item.npc_can_fall : false;
		var above = this.getGeo().getClosestPlatPoint(x, y, 1);
		if (above.plat && Math.abs(above.point.y - y) < yStep) {
			this.platform = above.plat;
		}
		else {
			var below = this.getGeo().getClosestPlatPoint(x, y, -1);
			if (below.plat && (canFall || Math.abs(y - below.point.y) < yStep)) {
				this.platform = below.plat;
			}
		}
	}
};


/**
 * Helper for {@link ItemMovement#moveWalking}: checks if a direction change is
 * required to reach the current destination, and performs it if it is
 * (including calling the movement callback accordingly).
 *
 * @param {number} x x coordinate of destination
 * @param {object} nextStep the nextStep object being built
 * @private
 */
ItemMovement.prototype.walkingDirection = function walkingDirection(x, nextStep) {
	var dir = this.dirX(x);
	if (x !== this.item.x && dir !== this.facing) {
		if (this.callback) {
			nextStep.fullChanges = this.callback.call(this.item,
				{status: MOVE_CB_STATUS.DIR_CHANGE, dir: dir > 0 ? 'right' : 'left'});
		}
		this.facing = dir;
	}
};


/**
 * Platform bound movement algorithm; advances the item towards the
 * next path segment destination over reachable platforms, considering
 * walls and the item's movement capabilities.
 *
 * @param {object} nextPath the current path segment
 * @returns {object} the next step toward the destination
 */
ItemMovement.prototype.moveWalking = function moveWalking(nextPath) {
	var nextStep = {dx: 0, dy: 0, finished: false, fullChanges: false};

	// adjust direction and calculate horizontal movement
	this.walkingDirection(nextPath.x, nextStep);
	var step = Math.min(Math.abs(this.item.x - nextPath.x),
		this.item.npc_walk_speed / 3);
	nextStep.dx = Math.floor(this.item.x + this.facing * step);
	nextStep.dy = this.item.y;
	// dy is adjusted later (depends on where the horizontal movement takes us)

	// find initial or next platform
	if (!this.platform || nextStep.dx < this.platform.start.x ||
		nextStep.dx > this.platform.end.x) {
		this.findPlatform(nextStep.dx, this.offsetY(this.item.y, true));
	}
	// calculate next vertical position
	if (this.platform) {
		nextStep.dy = this.offsetY(
			utils.pointOnPlat(this.platform, nextStep.dx).y, false);
	}
	// check if we walked into a wall, or could not find a suitable platform
	// (end movement if so)
	var block = this.checkWalls(nextStep);
	if (block || !this.platform) {
		return {dx: block ? block.x : this.item.x, dy: this.item.y,
			finished: true, status: MOVE_CB_STATUS.ARRIVED_NEAR,
			fullChanges: nextStep.fullChanges};
	}
	// are we already there?
	if (Math.abs(nextPath.x - this.item.x) === 0) {
		nextStep.finished = true;
	}
	return nextStep;
};


/**
 * Helper for {@link ItemMovement#moveFlying}; sets a new
 * destination within the confined flight area.
 *
 * @param {object} nextPath object defining the flight area; needs to
 *        contain `width`, `height`, `left`, `right` and `top`
 *        properties; `x` and `y` will be added/changed
 * @private
 */
ItemMovement.prototype.nextFlightPath = function nextFlightPath(nextPath) {
	// fly back and forth between left and right edge of the area (or close to
	// it), at varying heights (updates current path when destionation reached)
	if (!('x' in nextPath) || this.item.x === nextPath.x) {
		var xVariation = Math.random() * (nextPath.width / 4);
		var dLeft = Math.abs(this.item.x - nextPath.left);
		var dRight = Math.abs(this.item.x - nextPath.right);
		if (dRight < dLeft) {
			nextPath.x = Math.round(nextPath.left + xVariation);
		}
		else {
			nextPath.x = Math.round(nextPath.right - xVariation);
		}
	}
	nextPath.y = Math.round(nextPath.top + Math.random() * nextPath.height);
};


/**
 * Helper for {@link ItemMovement#moveFlying}; sets the animation state
 * and direction according to current position and destination.
 *
 * @param {number} distX horizontal distance from the destination
 * @param {number} distY vertical distance from the destination
 * @param {number} dir direction of the destination
 * @private
 */
ItemMovement.prototype.changeState = function changeState(distX, distY, dir) {
	if (this.options && this.options.changeState) {
		this.item.state = 'fly';
		if (distX < 10 && distY < 10) {
			this.item.state += '-top';
		}
		else if (distX > distY * 2) {
			this.item.state += '-side';
		}
		else if (distX > distY) {
			this.item.state += '-angle1';
		}
		else {
			this.item.state += '-angle2';
		}
		this.item.dir = dir > 0 ? 'right' : 'left';
	}
};


/**
 * Butterfly-style flying movement algorithm (both for flying
 * pseudo-randomly in a confined area, and towards a specific target).
 *
 * @param {object} nextPath the current path segment
 * @returns {object} the next step toward the destination
 */
ItemMovement.prototype.moveFlying = function moveFlying(nextPath) {
	var nextStep = {dx: 0, dy: 0, finished: false};
	// stop if we reached the destination (and the move is supposed to end there)
	if (nextPath.stopAtEnd && this.item.x === nextPath.x && this.item.y === nextPath.y) {
		return {forceStop: MOVE_CB_STATUS.ARRIVED};
	}
	// otherwise, set new destination within the flight area if necessary
	if (!('x' in nextPath) || !nextPath.stopAtEnd && this.item.x === nextPath.x) {
		this.nextFlightPath(nextPath);
	}
	var dirX = this.dirX(nextPath.x);
	var dirY = this.dirY(nextPath.y);
	var distX = Math.abs(this.item.x - nextPath.x);
	var distY = Math.abs(this.item.y - nextPath.y);

	// add a touch of randomization to the y movement
	if ('height' in nextPath) {
		distY += Math.random() * nextPath.height / 2 - nextPath.height / 4;
	}
	// change animation state if necessary
	this.changeState(distX, distY, dirX);

	// calculate the fraction of the way to the target we can cover in this step
	var frac = nextPath.speed / 3 / Math.sqrt(distX * distX + distY * distY);
	frac = Math.min(frac, 1);  // make sure we don't overshoot

	// set next step destination one step further towards the path segment target
	if (frac < 1) {
		nextStep.dy = this.item.y + dirY * distY * frac;
		nextStep.dx = this.item.x + dirX * distX * frac;
	}
	else {
		// we're within 1px of the target, so just go there exactly
		nextStep.dy = nextPath.y;
		nextStep.dx = nextPath.x;
	}
	// if we reached the destination and the move is supposed to end there,
	// set 'finished' property
	if (nextPath.stopAtEnd && nextStep.dx === nextPath.x && nextStep.dy === nextPath.y) {
		nextStep.finished = true;
	}
	return nextStep;
};


/**
 * Direct movement (linear, without concern for platforms or walls).
 * Just advances the item towards the next path segment destination,
 * and sets the appropriate properties in the returned object when
 * it has been reached.
 *
 * @param {object} nextPath the current path segment
 * @returns {object} the next step toward the destination
 */
ItemMovement.prototype.moveDirect = function moveDirect(nextPath) {
	this.getGeo().limitPath(this.item, nextPath);
	var nextStep = {dx: 0, dy: 0, finished: false};
	// check if we're already there
	if (this.item.x === nextPath.x && this.item.y === nextPath.y) {
		nextStep.forceStop = MOVE_CB_STATUS.ARRIVED;
		return nextStep;
	}
	var distX = Math.abs(this.item.x - nextPath.x);
	var distY = Math.abs(this.item.y - nextPath.y);

	// calculate the fraction of the way to the target we can cover in this step
	var frac = nextPath.speed / 3 / Math.sqrt(distX * distX + distY * distY);
	frac = Math.min(frac, 1);  // make sure we don't overshoot

	// set next step destination one step further towards the path segment target
	if (frac < 1) {
		nextStep.dy = this.item.y + this.dirY(nextPath.y) * distY * frac;
		nextStep.dx = this.item.x + this.dirX(nextPath.x) * distX * frac;
	}
	else {
		// we're within 1px of the target, so just go there exactly
		nextStep.dy = nextPath.y;
		nextStep.dx = nextPath.x;
	}
	// if we reached the destination, set 'finished' property
	if (nextStep.dx === nextPath.x && nextStep.dy === nextPath.y) {
		nextStep.finished = true;
	}
	return nextStep;
};


/**
 * Helper for flocking vector functions. Normalizes and limits the
 * vector.
 *
 * @param {number} vX current vX
 * @param {number} vY current vY
 * @param {number} limit limiting magnitude
 * @returns {object} vx, vy object with the limited vector
 */
ItemMovement.prototype.limitVector = function limitVector(vX, vY, limit) {
	var n = Math.sqrt(vX * vX + vY * vY);
	if (n > limit) {
		vX = vX / n * limit;
		vY = vY / n * limit;
	}
	return {vx: vX, vy: vY};
};


/**
 * Helper for {@link ItemMovement#flockGather}: steers toward a vector.
 */
ItemMovement.prototype.steer = function steer(x, y, nextPath) {
	var dx = x - this.item.x;
	var dy = y - this.item.y;
	// just looking for non-zero so no need for a distance calculation
	if (dx !== 0 || dy !== 0) {
		var desired = this.limitVector(dx, dy, nextPath.speed);
		x = desired.vx - nextPath.vx;
		y = desired.vy - nextPath.vy;
		desired = this.limitVector(x, y, nextPath.speed);
		return desired;
	}
	return {vx: 0, vy: 0};
};


/**
 * Helper for {@link ItemMovement#moveFlock}: calculates the gather
 * vector for flocking.
 *
 * @param {object} nextPath the current path segment
 * @param {array} neighbours set of neighbours that are being used
 * @returns {object} vx, vy object which is the gather vector
 */
ItemMovement.prototype.flockGather = function flockGather(nextPath, neighbours) {
	// flocking behavior 2: gathering
	var gatherCount = 0;
	var gatherX = 0;
	var gatherY = 0;

	for (var k in neighbours) {
		var n = neighbours[k];
		var dx = this.item.x - n.x;
		// our Y is backwards from what the normal algorithms expect
		var dy = this.item.y - n.y;
		var dd = dx * dx + dy * dy;
		if (dd < FLOCK_RADIUS_SQUARED) {
			gatherX += n.x;
			gatherY += n.y;
			gatherCount++;
		}
	}
	if (gatherCount) {
		// turn gather into a vector
		gatherX = gatherX / gatherCount;
		gatherY = gatherY / gatherCount;
		// steer
		return this.steer(gatherX, gatherY, nextPath);
	}
	return {vx: 0, vy: 0};
};


/**
 * Helper for {@link ItemMovement#moveFlock}: calculates the align
 * vector for flocking.
 *
 * @param {object} nextPath the current path segment
 * @param {array} neighbours set of neighbours that are being used
 * @returns {object} vx, vy object which is the gather vector
 */
ItemMovement.prototype.flockAlign = function flockAlign(nextPath, neighbours) {
	// flocking behavior 1: alignment
	var alignCount = 0;
	var alignVx = 0;
	var alignVy = 0;

	for (var k in neighbours) {
		var n = neighbours[k];
		var dx = this.item.x - n.x;
		// our Y is backwards from what the normal algorithms expect
		var dy = this.item.y - n.y;
		var dd = dx * dx + dy * dy;
		if (dd > 0 && dd < FLOCK_RADIUS_SQUARED) {
			if (n.gsMovement && n.gsMovement.path &&
				n.gsMovement.path.length > 0 && 'vx' in n.gsMovement.path[0]) {
				alignVx += n.gsMovement.path[0].vx;
				alignVy += n.gsMovement.path[0].vy;
				alignCount++;
			}
		}
	}
	if (alignCount) {
		// average align
		alignVx = alignVx / alignCount;
		alignVy = alignVy / alignCount;
		// limit align
		return this.limitVector(alignVx, alignVy, nextPath.speed);
	}
	return {vx: 0, vy: 0};
};


/**
 * Helper for {@link ItemMovement#moveFlock}; calculates the repel
 * vector for flocking.
 *
 * @param {object} nextPath the current path segment
 * @param {array} neighbours set of neighbours that are being used
 * @returns {object} vx, vy object which is the gather vector
 */
ItemMovement.prototype.flockRepel = function flockRepel(nextPath, neighbours) {
	// flocking behavior 3: repelling
	var repelCount = 0;
	var repelVx = 0;
	var repelVy = 0;

	for (var k in neighbours) {
		var n = neighbours[k];
		var dx = this.item.x - n.x;
		var dy = this.item.y - n.y;
		var dd = dx * dx + dy * dy;
		if (dd > 0 && dd < FLOCK_REPEL_DIST_SQUARED) {
			repelVx += dx / dd * nextPath.speed;
			repelVy += dy / dd * nextPath.speed;
			repelCount++;
		}
	}
	if (repelCount) {
		// repel mean
		repelVx = repelVx / repelCount;
		repelVy = repelVy / repelCount;
	}
	return {vx: repelVx, vy: repelVy};
};


/**
 * Helper for {@link ItemMovement#moveFlock}: bounce off location
 * boundaries.
 *
 * @param {object} nextPath the current path segment
 */
ItemMovement.prototype.flockBounce = function flockBounce(nextPath) {
	// Keep the flock on the street
	if (nextPath.x < this.item.container.geo.l) {
		nextPath.x = this.item.container.geo.l;
		nextPath.vx *= -1;
	}
	if (nextPath.x > this.item.container.geo.r) {
		nextPath.x = this.item.container.geo.r;
		nextPath.vx *= -1;
	}
	if (nextPath.y > this.item.container.geo.b) {
		nextPath.y = this.item.container.geo.b;
		nextPath.vy *= -1;
	}
	if (nextPath.y < this.item.container.geo.t) {
		nextPath.y = this.item.container.geo.t;
		nextPath.vy *= -1;
	}
};


/**
 * Helper for {@link ItemMovement#moveFlock}: build the flock.
 *
 * @returns {array} array of flock items
 */
ItemMovement.prototype.flockBuild = function flockBuild() {
	var neighbours = [];
	for (var k in this.item.container.items) {
		var it = this.item.container.items[k];
		if (it.class_tsid !== this.item.class_tsid) {
			continue;
		}
		if (it.tsid === this.item.tsid) {
			continue;
		}
		if (it.deleted || isNaN(it.x) || isNaN(it.y)) {
			continue;
		}
		neighbours.push(it);
	}
	return neighbours;
};


/**
 * Helper for {@link ItemMovement#moveFlock}: sets the animation state
 * and direction according to current position and destination.
 *
 * @param {number} vX horizontal distance from the destination
 * @param {number} vY vertical distance from the destination
 * @param {number} dirX horizontal direction of the destination
 * @param {number} dirY vertical direction of the destination
 * @param {number} oVx old horizontal direction
 * @private
 */
ItemMovement.prototype.changeFlockState = function changeFlockState(vX, vY,
	dirX, dirY, oVx) {
	var distX = Math.abs(vX);
	var distY = Math.abs(vY);
	/* eslint-disable no-nested-ternary */
	var sX = vX ? vX < 0 ? -1 : 1 : 0;
	var soX = oVx ? oVx < 0 ? -1 : 1 : 0;
	/* eslint-enable no-nested-ternary */
	if (sX !== soX) {
		this.item.state = 'turnRight';
	}
	else {
		this.item.state = 'swim';
		var t = Math.abs(distY / distX);
		if (t < 0.13) {
			this.item.state += 'Right';
		}
		else if (dirY < 0) {
			if (t < 0.39) {
				this.item.state += 'RightUp15';
			}
			else {
				this.item.state += 'RightUp30';
			}
		}
		else if (t < 0.39) {
			this.item.state += 'RightDown15';
		}
		else {
			this.item.state += 'RightDown30';
		}
	}
	this.item.dir = dirX > 0 ? 'right' : 'left';
};


/**
 * Flocking movement algorithm: calculates the flock movement vector
 * and then uses direct movement to move the NPC along that vector.
 *
 * @param {object} nextPath the current path segment
 * @returns {object} the next step toward the destination
 */
ItemMovement.prototype.moveFlock = function moveFlock(nextPath) {
	var neighbours = this.flockBuild();
	var align = this.flockAlign(nextPath, neighbours);
	var gather = this.flockGather(nextPath, neighbours);
	var repel = this.flockRepel(nextPath, neighbours);

	var oldVx = nextPath.vx;
	nextPath.vx = nextPath.vx + gather.vx + 20 * repel.vx + align.vx;
	nextPath.vy = nextPath.vy + gather.vy + 20 * repel.vy + align.vy;
	// don't be sedentary
	if (nextPath.vx === 0 && nextPath.vy === 0) {
		nextPath.vx = Math.random() * 10;
		nextPath.vy = Math.random() * 10;
	}
	nextPath.x = Math.round(this.item.x + nextPath.vx);
	nextPath.y = Math.round(this.item.y + nextPath.vy);
	this.flockBounce(nextPath);

	var dirX = this.dirX(nextPath.x);
	var dirY = this.dirY(nextPath.y);
	this.changeFlockState(nextPath.vx, nextPath.vy, dirX, dirY, oldVx);

	var nextStep = this.moveDirect(nextPath);
	nextStep.finished = false;
	if (nextStep.force_stop) {
		nextStep.dx = this.item.x;
		nextStep.dy = this.item.y;
		nextStep.force_stop = 0;
	}
	return nextStep;
};


/**
 * Dispatches the next path segment to the specific movement handler
 * for the selected transportation mode.
 *
 * @param {object} nextPath the current path segment
 * @returns {object} the next step toward the destination
 * @private
 */
ItemMovement.prototype.transport = function transport(nextPath) {
	switch (nextPath.transport) {
		case 'walking':
			return this.moveWalking(nextPath);
		case 'flying':
			return this.moveFlying(nextPath);
		case 'direct':
			return this.moveDirect(nextPath);
		case 'flock':
			return this.moveFlock(nextPath);
	}
};


/**
 * Moves the item one step along its path.
 * This is the core movement function that is called three times per
 * second by an internal interval defined for the item.
 */
ItemMovement.prototype.moveStep = function moveStep() {
	// sanity checking, this should not occur
	if (!this.path || this.path.length === 0) {
		log.error('movement: moving but no path information for %s', this.item);
		return this.stopMove(MOVE_CB_STATUS.ARRIVED);
	}
	// determine next movement step along the current path segment
	var nextStep = this.transport(this.path[0]);
	if (nextStep && !nextStep.forceStop) {
		if (nextStep.dx < this.getGeo().l || nextStep.dx > this.getGeo().r) {
			log.warn('movement: step destination out of bounds for %s', this.item);
			return this.stopMove(MOVE_CB_STATUS.ARRIVED_NEAR);
		}
		// actually move and announce the resulting changes
		this.item.setXY(nextStep.dx, nextStep.dy);
		this.item.queueChanges(false, nextStep.fullChanges);
		this.item.container.flush();
		// advance to next path segment
		if (nextStep.finished) {
			this.path.shift();
			log.debug({path: this.path}, 'movement: path segment finished');
		}
	}
	else if (nextStep && nextStep.forceStop) {
		return this.item.setGsTimer({fname: 'gsStopMoving', delay: 1,
			internal: true, args: [nextStep.forceStop, true]});
	}
	else {
		// fallback (transport method failed to process path segment properly)
		this.path.shift();
		log.debug({path: this.path}, 'movement: transport did not return next step');
	}
	// no more path segments -> announce that we're done here
	if (this.path.length === 0) {
		var status = MOVE_CB_STATUS.ARRIVED;
		if (nextStep && nextStep.status) status = nextStep.status;
		return this.item.setGsTimer({fname: 'gsStopMoving', delay: 1,
			internal: true, args: [status, true]});
	}
	// Set the timer for the next movement step
	this.item.setGsTimer({fname: 'movementTimer', delay: 333, internal: true});
};


/**
 * Builds a movement path according to the transport mode and other
 * options.
 *
 * @param {string} transport the transport type for the movement
 *        (must be `walking`, `direct`, `flying` or `kicked`)
 * @param {object} dest destination coordinates (either `x` and `y`, or
 *        an area defined by `left`, `right`, `top`, `width` and
 *        `height`)
 * @returns {array} the resulting path; a list of distinct path
 *          segments like this (not a complete example!):
 * ```
 * [
 *     {x: 12, y: 34, speed: 10, transport: 'direct'},
 *     {x: 100, y: 0, speed: 30, transport: 'flying', stopAtEnd: true},
 *     ...
 * ]
 * ```
 */
ItemMovement.prototype.buildPath = function buildPath(transport, dest) {
	var geo = this.getGeo();
	var path;
	if (transport === 'walking') {
		//TODO: actual pathing
		path = [
			{x: dest.x, y: dest.y, transport: 'walking'},
		];
	}
	else if (transport === 'direct') {
		// straight line movement path
		path = [
			{x: dest.x, y: dest.y, speed: this.options.speed, transport: 'direct'},
		];
	}
	else if (transport === 'flying') {
		if (!this.options.stopAtEnd) {
			path = [{
				left: geo.limitX(dest.left),
				right: geo.limitX(dest.right),
				width: dest.width,
				top: dest.top,
				height: dest.height,
				speed: this.options.speed,
				stopAtEnd: false,
				transport: 'flying',
			}];
		}
		else {
			path = [{
				x: geo.limitX(dest.x),
				y: geo.limitY(dest.y),
				speed: this.options.speed,
				stopAtEnd: true,
				transport: 'flying',
			}];
		}
	}
	else if (transport === 'kicked') {
		path = [{
			x: geo.limitX(this.item.x + this.options.vx),
			y: geo.limitY(this.item.y + this.options.vy),
			speed: 90,
			transport: 'direct',
		}];
		var tx = 2 * this.options.vx;
		if (tx >= 6) {
			var speed = Math.min(Math.abs(tx) / 2, 45);
			speed = Math.max(3, speed);
			path.push({
				x: geo.limitX(this.item.x + tx),
				y: geo.limitY(this.item.y + this.options.vy),
				speed: speed,
				transport: 'direct',
			});
		}
		// TODO: Handle more than just platform landings
		tx = geo.limitX(this.item.x + 3 * this.options.vx);
		var platform = geo.getClosestPlatPoint(tx,
			this.item.y + this.options.vy, -1).plat;
		if (platform) {
			var ty = utils.pointOnPlat(platform, tx).y;
			path.push({x: tx, y: ty, speed: 90, transport: 'direct'});
		}
		else {
			// set the item back to its starting location, which is safe
			log.warn('movement: failed to find landing platform. bad plats for %s',
				this.item);
			path.push({x: this.item.x, y: this.item.y, speed: 90, transport: 'direct'});
		}
		this.callback = this.item.onPlatformLanding;
	}
	else if (transport === 'flock') {
		path = [{
			vx: 0,
			vy: 0,
			speed: 300,
			transport: 'flock',
		}];
	}
	return path;
};


/**
 * Starts movement to a given destination with specific parameters.
 * This is the main entry point that triggers building the path.
 *
 * @param {string} transport the transportation mode for this movement
 *        (must be `walking`, `direct`, `flying` or `kicked`)
 * @param {object} dest destination coordinates (either `x` and `y`, or
 *        an area defined by `left`, `right`, `top`, `width` and
 *        `height`)
 * @param {object} options for this movement
 * @param {number} [options.flags] a bitmask affecting move behavior
 *        (see NPC movement spec)
 * @param {string} [options.callback] name of the function called on
 *        movement events
 * @param {*} [options.callbackParam] parameter for the event callback
 * @param {boolean} [options.changeState] change animation state during
 *        movement (only applicable for butterfly movement)
 * @param {number} [options.speed] movement speed in px/sec
 * @param {boolean} [options.stopAtEnd] stop at the destination (only
 *        relevant for flying movement)
 * @param {number} [options.vx] horizontal velocity (only for flying)
 * @param {number} [options.vy] vertical velocity (only for flying)
 * @returns {boolean} `true` if movement to the given destination is
 *          possible and has started
*/
ItemMovement.prototype.startMove = function startMove(transport, dest, options) {
	if (this.path) {
		this.stopMove(MOVE_CB_STATUS.STOP_NEW_MOVE);
	}
	this.options = options = options || {};
	if ('callback' in options) {
		this.callback = this.item[options.callback];
	}
	this.facing = 0; // unset
	if (options.path) {
		this.path = options.path;
	}
	else {
		this.path = this.buildPath(transport, dest);
		log.debug({path: this.path}, 'movement: new path set');
	}
	// explicit first step to check if we are stuck, i.e. completely unable to move
	this.moveStep();
	if (!this.path || this.path.length === 0) {
		return false;
	}
	return true;
};
