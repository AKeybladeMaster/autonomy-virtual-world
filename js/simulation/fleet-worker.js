/* Large fleets run the SAME lane/collision model off the UI thread. No libraries. */
self.window = self;
importScripts(
	"../constants/simulation.js",
	"../world/generation/math/utils.js",
	"../world/generation/math/spatial-grid.js",
	"../world/generation/primitives/point.js",
	"../world/generation/primitives/segment.js",
	"../world/generation/primitives/polygon.js",
	"../world/generation/primitives/envelope.js",
	"../world/generation/math/graph.js",
	"../brain/network.js",
	"../brain/sensor.js",
	"../brain/presets.js",
	"../world/generation/country.js",
	"../world/generation/traffic-network.js",
	"../objects/vehicle-geometry.js",
	"../simulation/traffic.js",
);
let sim = null,
	iterator = null,
	spawning = false,
	paused = false,
	token = 0,
	view = null,
	best = null;
let lastPublish = 0,
	lastWall = 0,
	lastSim = 0,
	requestCount = 0,
	driverQuery = { query: "", offset: 0 },
	simRate = 0,
	stepStarted = 0,
	completedTime = 0;
function carView(car, detail = false) {
	if (!car) return null;
	const { id, name, x, y, width, height, angle, color, speed, fittness, status } = car;
	const result = {
		id,
		name,
		x,
		y,
		width,
		height,
		angle,
		color,
		speed,
		fittness,
		status,
		damaged: false,
	};
	if (detail) {
		result.brain = car.brain;
		result.sensor = { rays: car.sensor.rays, readings: car.sensor.readings };
	}
	return result;
}
function driverPage() {
	if (!sim) return;
	const query = driverQuery.query.trim().toLowerCase();
	let total = 0;
	const rows = [];
	for (const car of sim.cars)
		if (
			!query ||
			car.name.toLowerCase().includes(query) ||
			String(car.id + 1) === query
		) {
			if (total >= driverQuery.offset && rows.length < SIMULATION.DRIVER_PAGE_SIZE)
				rows.push({ id: car.id, name: car.name });
			total++;
		}
	postMessage({
		type: "drivers",
		rows,
		total,
		offset: driverQuery.offset,
		query: driverQuery.query,
	});
}
function publish(force = false) {
	const now = performance.now();
	if (!sim || (!force && now - lastPublish < SIMULATION.SNAPSHOT_INTERVAL_MS)) return;
	lastPublish = now;
	const focus = sim.cars[view?.selectedId || 0] || sim.cars[0];
	const camera = view?.camera || { x: 0, y: 0, scale: 0.2 },
		w = view?.width || 1000,
		h = view?.height || 800;
	const cx = view?.follow && focus ? focus.x : camera.x,
		cy = view?.follow && focus ? focus.y : camera.y;
	const chaseRadius = view?.viewMode !== "2d" ? 2.5 * sim.unit : 0;
	const rx = Math.max(chaseRadius, w / camera.scale / 2 + 0.2),
		ry = Math.max(chaseRadius, h / camera.scale / 2 + 0.2);
	const overview = camera.scale < 8,
		stride = overview
			? Math.max(1, Math.ceil(sim.cars.length / SIMULATION.OVERVIEW_CARS))
			: 1;
	const cars = [],
		mini = [];
	let top = null;
	for (let itemIndex = 0; itemIndex < sim.cars.length; itemIndex++) {
		const car = sim.cars[itemIndex];
		if (!top || car.fittness > top.fittness) top = car;
		if (
			itemIndex % Math.max(1, Math.ceil(sim.cars.length / SIMULATION.MINIMAP_CARS)) ===
			0
		)
			mini.push({ x: car.x, y: car.y });
		if (
			(itemIndex % stride === 0 || car === focus) &&
			Math.abs(car.x - cx) < rx &&
			Math.abs(car.y - cy) < ry &&
			cars.length < 8000
		)
			cars.push(carView(car, car === focus));
	}
	best = top;
	if (now - lastWall > 2000) {
		simRate = (completedTime - lastSim) / ((now - lastWall) / 1000);
		lastWall = now;
		lastSim = completedTime;
	}
	postMessage({
		type: "snapshot",
		cars,
		focus: carView(focus, true),
		best: carView(best, true),
		total: sim.cars.length,
		requested: requestCount,
		mini,
		spawning,
		simRate,
		simTime: completedTime,
	});
}
function pump(run) {
	if (run !== token) return;
	if (paused && !spawning) {
		publish();
		setTimeout(() => pump(run), 50);
		return;
	}
	const deadline = performance.now() + SIMULATION.WORKER_BUDGET_MS;
	try {
		if (!iterator) {
			iterator = sim.stepChunks(SIMULATION.WORKER_STEP_SECONDS);
			stepStarted = performance.now();
		}
		let done = false;
		do {
			done = iterator.next().done;
		} while (!done && performance.now() < deadline);
		if (done) {
			iterator = null;
			completedTime = sim.time;
			if (spawning) {
				spawning = false;
				driverPage();
				postMessage({ type: "ready", total: sim.cars.length });
			}
		}
		publish();
		setTimeout(
			() => pump(run),
			done
				? Math.max(
						0,
						SIMULATION.WORKER_STEP_SECONDS * 1000 - (performance.now() - stepStarted),
					)
				: 0,
		);
	} catch (error) {
		postMessage({ type: "error", message: error.message });
	}
}
self.onmessage = ({ data }) => {
	try {
		if (data.type === "init") {
			token++;
			requestCount = data.count;
			paused = !!data.paused;
			view = data.view;
			postMessage({ type: "progress", message: "Loading traffic network…" });
			let world;
			if (data.world.kind === "country") {
				if (!self.ALBANIA_ROADS) importScripts("../../data/albania-roads.js");
				const source = self.ALBANIA_ROADS;
				world = {
					kind: "country",
					data: source,
					roadWidth: SIMULATION.ROAD_WIDTH,
					graph: Graph.load(data.world.graph),
					markings: data.world.markings || [],
					roads: source.roads.map((r) => ({
						refs: r[3],
						oneWay: r[2],
						drivable: !!r[5],
						name: r[4],
					})),
				};
			} else
				world = {
					graph: Graph.load(data.world.graph),
					roadWidth: data.world.roadWidth,
					markings: data.world.markings || [],
				};
			world.roadBorders = data.roadBorders || [];
			sim = new TrafficSimulation(world);
			sim.focusId = view?.selectedId || 0;
			sim.setCruiseSpeed(data.speed);
			spawning = true;
			iterator = sim.spawnChunks(data.count, data.brain);
			lastWall = performance.now();
			lastSim = 0;
			pump(token);
		} else if (data.type === "view") {
			view = data.view;
			if (sim) sim.focusId = view.selectedId;
		} else if (data.type === "pause") paused = data.paused;
		else if (data.type === "speed" && sim) sim.setCruiseSpeed(data.speed);
		else if (data.type === "drivers") {
			driverQuery = data;
			driverPage();
		}
	} catch (error) {
		postMessage({ type: "error", message: error.message });
	}
};
