/* Hybrid driving: neural obstacle perception, right-hand lane paths, and a
   deterministic safety supervisor. The supervisor always overrides unsafe output. */
class TrafficSimulation {
	constructor(world, random = Math.random) {
		this.world = world;
		this.random = random;
		this.unit = world.roadWidth / SIMULATION.ROAD_WIDTH;
		this.network = buildTrafficNetwork(world);
		// Shape points with two neighbours are continuous roads, not junctions.
		const neighbours = new Map();
		for (const arc of this.network.arcs) {
			if (!neighbours.has(arc.from)) neighbours.set(arc.from, new Set());
			if (!neighbours.has(arc.to)) neighbours.set(arc.to, new Set());
			neighbours.get(arc.from).add(arc.to);
			neighbours.get(arc.to).add(arc.from);
		}
		this.junctionNodes = new Set(
			[...neighbours]
				.filter(([, connected]) => connected.size !== 2)
				.map(([node]) => node),
		);
		// Acute road approaches share a larger intersection. Keep waiting cars
		// outside that area so they cannot block the driver's reserved turn.
		const approaches = new Map();
		for (const arc of this.network.arcs) {
			const points = arc.edge.points;
			const start = arc.reverse ? points.length - 1 : 0;
			const end = arc.reverse ? 0 : points.length - 1;
			for (const [node, neighbour, direction] of [
				[
					arc.from,
					arc.to,
					normalize(subtract(points[start + (arc.reverse ? -1 : 1)], points[start])),
				],
				[
					arc.to,
					arc.from,
					normalize(subtract(points[end + (arc.reverse ? 1 : -1)], points[end])),
				],
			]) {
				if ((neighbours.get(node)?.size || 0) < 3) continue;
				if (!approaches.has(node)) approaches.set(node, new Map());
				approaches.get(node).set(neighbour, direction);
			}
		}
		const clearances = new Map();
		for (const [node, directionsByRoad] of approaches) {
			const directions = [...directionsByRoad.values()];
			let clearance = world.roadWidth * 0.7;
			for (let first = 0; first < directions.length; first++)
				for (let second = first + 1; second < directions.length; second++) {
					const halfAngleSine = Math.sqrt(
						Math.max(0, (1 - dot(directions[first], directions[second])) / 2),
					);
					clearance = Math.max(
						clearance,
						world.roadWidth / (2 * Math.max(0.125, halfAngleSine)),
					);
				}
			clearances.set(node, clearance);
		}
		for (const arc of this.network.arcs) {
			arc.startClearance = clearances.get(arc.from);
			arc.endClearance = clearances.get(arc.to);
		}
		this.borderGrid = new SpatialGrid(world.roadWidth * 4);
		for (const border of world.roadBorders || []) {
			this.borderGrid.add(
				[border.p1, border.p2],
				Math.min(border.p1.x, border.p2.x),
				Math.min(border.p1.y, border.p2.y),
				Math.max(border.p1.x, border.p2.x),
				Math.max(border.p1.y, border.p2.y),
			);
		}
		this.reservations = new Map();
		this.queues = new Map();
		this.approachLeaders = new Map();
		this.cars = [];
		this.time = 0;
		this.cruiseSpeedKmh = SIMULATION.DEFAULT_SPEED_KMH;
	}
	setCruiseSpeed(kmh) {
		if (!Number.isFinite(kmh))
			throw new TypeError("Cruising speed must be a finite number.");
		this.cruiseSpeedKmh = Math.max(
			SIMULATION.MIN_SPEED_KMH,
			Math.min(SIMULATION.MAX_SPEED_KMH, kmh),
		);
		// km/h -> metres/second -> 1:100 world units; local maps scale by unit.
		const maxSpeed = (this.cruiseSpeedKmh / 360) * this.unit;
		for (const car of this.cars) car.maxSpeed = maxSpeed;
		return this.cruiseSpeedKmh;
	}
	nextArc(arc) {
		const all = this.network.outgoing.get(arc.to) || [];
		const forward = all.filter((a) => a.to !== arc.from);
		const choices = forward.length ? forward : all;
		return choices.length ? choices[Math.floor(this.random() * choices.length)] : null;
	}
	spawn(count, brain = trafficBrain()) {
		const iterator = this.spawnChunks(count, brain);
		while (!iterator.next().done) {
			/* Synchronous path for small fleets and tests. */
		}
		return this.cars;
	}
	*spawnChunks(count, brain = trafficBrain()) {
		count = validatePopulation(count);
		this.cars = [];
		this.reservations.clear();
		this.queues.clear();
		const first = [
			"Aria",
			"Luan",
			"Nova",
			"Drita",
			"Orion",
			"Bora",
			"Atlas",
			"Era",
			"Lumi",
			"Vega",
			"Elio",
			"Mira",
			"Arben",
			"Nika",
			"Sora",
			"Ilir",
			"Astra",
			"Yll",
			"Rin",
			"Lea",
		];
		const second = [
			"Blue",
			"Swift",
			"Moon",
			"Echo",
			"Sky",
			"Vale",
			"Wave",
			"Glow",
			"Star",
			"Dawn",
			"Frost",
			"Rain",
			"Flare",
			"Dusk",
			"Cloud",
			"Ray",
			"Leaf",
			"Comet",
			"Pearl",
			"Neon",
		];
		const names = [];
		for (const a of first) for (const b of second) names.push(`${a} ${b}`);
		for (let itemIndex = names.length - 1; itemIndex > 0; itemIndex--) {
			const nextItemIndex = Math.floor(this.random() * (itemIndex + 1));
			[names[itemIndex], names[nextItemIndex]] = [
				names[nextItemIndex],
				names[itemIndex],
			];
		}
		const arcs = this.network.arcs;
		if (!arcs.length) return this.cars;
		const spawnGrid = new SpatialGrid(0.1 * this.unit);
		const start = this.world.markings.find((m) => m.type === "start");
		let startArcs = null;
		if (start) {
			startArcs = arcs
				.map((a) => ({ a, d: distance(a.edge.points[0], start.center) }))
				.sort((a, b) => a.d - b.d)
				.slice(0, 20)
				.map((x) => x.a);
		}
		for (
			let attempt = 0;
			this.cars.length < count && attempt < count * 100;
			attempt++
		) {
			if (attempt % 256 === 0) yield this.cars.length;
			const pool = startArcs || arcs,
				arc = pool[Math.floor(this.random() * pool.length)],
				lane = makeLane(arc, this.world.roadWidth);
			if (lane.length < this.unit * 0.15) continue;
			const s = lane.length * (0.15 + 0.65 * this.random()),
				pose = samplePath(lane, s);
			const spawnAngle = -angle(pose.direction) - Math.PI / 2;
			const clearance = vehiclePolygon(
				{ width: 0.024 * this.unit, height: 0.055 * this.unit },
				pose.point.x,
				pose.point.y,
				spawnAngle,
			);
			if (
				spawnGrid
					.query(
						pose.point.x - 0.09 * this.unit,
						pose.point.y - 0.09 * this.unit,
						pose.point.x + 0.09 * this.unit,
						pose.point.y + 0.09 * this.unit,
					)
					.some(
						(c) =>
							distance(c, pose.point) < this.unit * 0.09 &&
							polygonsOverlap(clearance, c.polygon),
					)
			)
				continue;
			const id = this.cars.length;
			const car = {
				id,
				name:
					names[id % names.length] +
					(id >= names.length ? ` ${Math.floor(id / names.length) + 1}` : ""),
				x: pose.point.x,
				y: pose.point.y,
				width: SIMULATION.CAR_WIDTH * this.unit,
				height: SIMULATION.CAR_LENGTH * this.unit,
				angle: -angle(pose.direction) - Math.PI / 2,
				color: ["#71bfff", "#c7a3ff", "#f4f8ff", "#57dcdf", "#ffaacb"][id % 5],
				speed: 0,
				maxSpeed: (this.cruiseSpeedKmh / 360) * this.unit,
				fittness: 0,
				damaged: false,
				arc,
				lane,
				s,
				transition: null,
				next: null,
				brain: JSON.parse(JSON.stringify(brain)),
				status: "Cruising",
				waitSince: null,
				lock: null,
				oldLocks: [],
			};
			car.sensor = new Sensor(car);
			car.sensor.rayLength = this.unit * 0.28;
			car.polygon = vehiclePolygon(car);
			this.cars.push(car);
			spawnGrid.add(car, car.x, car.y);
		}
		return this.cars;
	}
	requestJunction(car) {
		const node = car.arc.to;
		if (!this.junctionNodes.has(node)) return true;
		const leader = this.approachLeaders.get(car.arc);
		if (leader && leader !== car) {
			// A follower must not reserve a junction ahead of the car blocking its
			// own lane. Revoke premature reservations as lane membership changes.
			this.release(car, node);
			return false;
		}
		if (car.lock === node) return true;
		if (this.reservations.get(node) === car.id) {
			car.oldLocks = car.oldLocks.filter((held) => held.node !== node);
			car.lock = node;
			return true;
		}
		if (!this.queues.has(node)) this.queues.set(node, []);
		const queue = this.queues.get(node);
		if (!queue.includes(car.id)) queue.push(car.id);
		if (!this.reservations.has(node) && queue[0] === car.id) {
			this.reservations.set(node, car.id);
			car.lock = node;
			return true;
		}
		return false;
	}
	release(car, node = car.lock) {
		if (node === null) return;
		if (this.reservations.get(node) === car.id) this.reservations.delete(node);
		const q = this.queues.get(node);
		if (q) {
			const itemIndex = q.indexOf(car.id);
			if (itemIndex >= 0) q.splice(itemIndex, 1);
			if (!q.length) this.queues.delete(node);
		}
		if (car.lock === node) car.lock = null;
	}
	step(dt) {
		const iterator = this.stepChunks(dt);
		while (!iterator.next().done) {
			/* Same physics as the worker's cooperative chunks. */
		}
	}
	*stepChunks(dt) {
		this.time += dt;
		const u = this.unit,
			accel = SIMULATION.ACCELERATION * u,
			brake = SIMULATION.BRAKING * u,
			gap = SIMULATION.FOLLOWING_GAP * u;
		const grid = new PointSpatialGrid(0.5 * u);
		const near = [];
		this.approachLeaders.clear();
		for (let itemIndex = 0; itemIndex < this.cars.length; itemIndex++) {
			const car = this.cars[itemIndex];
			if (!car.transition) {
				const leader = this.approachLeaders.get(car.arc);
				if (!leader || car.s > leader.s) this.approachLeaders.set(car.arc, car);
			}
			grid.add(car, car.x, car.y);
			if (itemIndex % 1024 === 0) yield;
		}
		// Fair rotating order avoids permanently favoring the first car in a dense queue.
		const offset = Math.floor(this.time * 60) % Math.max(1, this.cars.length);
		for (let itemIndex = 0; itemIndex < this.cars.length; itemIndex++) {
			if (itemIndex % 256 === 0) yield;
			const car = this.cars[(itemIndex + offset) % this.cars.length];
			const stoppingDistance = (car.speed * car.speed) / (2 * brake);
			const lookAhead = car.height * 2 + gap + car.speed * 0.8 + stoppingDistance;
			grid.queryInto(
				car.x - lookAhead,
				car.y - lookAhead,
				car.x + lookAhead,
				car.y + lookAhead,
				near,
				car,
			);
			const path = car.transition || car.lane;
			const currentDirection = samplePath(path, car.s).direction;
			const visibleDirection = samplePath(
				path,
				Math.min(path.length, car.s + lookAhead),
			).direction;
			const bend = Math.acos(
				Math.max(-1, Math.min(1, dot(currentDirection, visibleDirection))),
			);
			car.sensor.rayLength = lookAhead;
			car.sensor.raySpread = Math.min(Math.PI * 0.65, Math.PI / 3 + bend * 1.4);
			const visibleBorders = this.borderGrid.query(
				car.x - lookAhead,
				car.y - lookAhead,
				car.x + lookAhead,
				car.y + lookAhead,
			);
			if (
				visibleBorders.length ||
				near.length ||
				this.focusId === undefined ||
				car.id === this.focusId
			)
				car.sensor.update(visibleBorders, near);
			else {
				car.sensor.rays = [];
				car.sensor.readings = [];
			}
			const hazard = near.length
				? car.sensor.scanPath(path, car.s, lookAhead, near)
				: null;
			const inputs = car.sensor.readings.length
				? car.sensor.readings.map((reading) =>
						reading && hazard && reading.vehicleId === hazard.vehicle.id
							? 1 - reading.offset
							: 0,
					)
				: [0, 0, 0, 0, 0];
			if (hazard) inputs[2] = Math.max(inputs[2], 1 - hazard.distance / lookAhead);
			const outputs = NeuralNetwork.feedForward(inputs, car.brain);
			let target = car.maxSpeed;
			car.status = "Cruising";
			if (!car.next) car.next = this.nextArc(car.arc);
			if (!car.transition) {
				const remaining = car.lane.length - car.s;
				if (remaining < Math.max(0.25 * u, stoppingDistance + 0.08 * u)) {
					if (!car.next) {
						target = Math.min(
							target,
							Math.sqrt(2 * brake * Math.max(0, remaining - gap)),
						);
						car.status = "Road ends";
					} else if (!this.requestJunction(car)) {
						target = Math.min(
							target,
							Math.sqrt(2 * brake * Math.max(0, remaining - gap)),
						);
						car.status = "Yielding at junction";
					}
				}
			} else target = Math.min(target, SIMULATION.JUNCTION_SPEED * u);
			if (hazard) {
				const free = Math.max(0, hazard.distance - gap);
				const safeSpeed = Math.min(target, Math.sqrt(2 * brake * free), free / 1.3);
				if (safeSpeed < target - 1e-8) car.status = "Following / yielding";
				target = safeSpeed;
				// The neural throttle adds a smooth response to a route-confirmed hit.
				// Physical clearance remains the final speed limit.
				if (inputs[2] > 0.45 && hazard.distance < stoppingDistance + gap + car.height)
					target = Math.min(target, car.maxSpeed * Math.max(0.2, outputs[0]));
			}
			const previousSpeed = car.speed;
			car.speed = Math.max(0, Math.min(target, car.speed + accel * dt));
			if (target < previousSpeed)
				car.speed = Math.max(target, previousSpeed - brake * dt);
			let travel = car.speed * dt;
			travel = Math.min(travel, path.length - car.s);
			const nextPose = samplePath(path, car.s + travel),
				nextAngle = -angle(nextPose.direction) - Math.PI / 2;
			// Sample the swept footprint too, so a large frame cannot tunnel through a car.
			let blocked = false;
			const samples = Math.max(1, Math.ceil(travel / (car.width * 0.3)));
			for (let k = 1; near.length && k <= samples && !blocked; k++) {
				const pose = samplePath(path, car.s + (travel * k) / samples),
					poly = vehiclePolygon(
						car,
						pose.point.x,
						pose.point.y,
						-angle(pose.direction) - Math.PI / 2,
					);
				blocked = near.some(
					(other) =>
						distance(other, pose.point) < car.height + other.height &&
						polygonsOverlap(poly, other.polygon),
				);
			}
			if (blocked) {
				car.speed = 0;
				travel = 0;
				car.status = "Safety stop";
			} else {
				car.x = nextPose.point.x;
				car.y = nextPose.point.y;
				car.angle = nextAngle;
				car.s += travel;
				car.fittness += travel;
				car.polygon = vehiclePolygon(car);
			}
			// Render perception at the final pose, not one physics step behind it.
			if (this.focusId === undefined || car.id === this.focusId)
				car.sensor.update(visibleBorders, near);
			for (const held of car.oldLocks) {
				held.remaining -= travel;
				if (held.remaining <= 0) this.release(car, held.node);
			}
			car.oldLocks = car.oldLocks.filter((held) => held.remaining > 0);
			if (car.s >= path.length - 1e-8 && car.next) {
				if (car.transition) {
					if (car.lock !== null)
						// Release once the rear footprint clears the connector. Holding a
						// full car length plus a following gap can lock both ends of a short road.
						car.oldLocks.push({
							node: car.lock,
							remaining: Math.hypot(car.width, car.height) / 2 + car.width * 0.1,
						});
					car.lock = null;
					car.arc = car.next;
					car.lane = makeLane(car.arc, this.world.roadWidth);
					car.next = null;
					car.transition = null;
					car.s = 0;
				} else if (!this.junctionNodes.has(car.arc.to) || car.lock === car.arc.to) {
					car.transition = connectorPath(
						car.lane,
						makeLane(car.next, this.world.roadWidth),
						this.world.roadWidth,
					);
					car.s = 0;
				}
			}
		}
	}
}
