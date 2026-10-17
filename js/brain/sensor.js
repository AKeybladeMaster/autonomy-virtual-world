class Sensor {
	constructor(car) {
		this.car = car;
		this.rayCount = 5;
		this.rayLength = 150;
		this.raySpread = Math.PI / 2;

		this.rays = [];
		this.readings = [];
	}

	update(roadBorders, traffic) {
		this.#castRays();
		this.readings = [];
		for (let itemIndex = 0; itemIndex < this.rays.length; itemIndex++) {
			this.readings.push(this.#getReading(this.rays[itemIndex], roadBorders, traffic));
		}
	}

	// Ray hits describe the full visible scene. Route clearance below determines
	// which visible vehicle can actually obstruct this car's swept footprint.
	scanPath(path, startDistance, lookAhead, traffic) {
		const stepLength = Math.max(this.car.height * 0.45, lookAhead / 80);
		const samples = Math.max(1, Math.ceil(lookAhead / stepLength));
		let nearest = null;
		for (let sampleIndex = 0; sampleIndex <= samples; sampleIndex++) {
			const travelled = Math.min(lookAhead, (sampleIndex * lookAhead) / samples);
			const pose = samplePath(path, startDistance + travelled);
			for (const vehicle of traffic) {
				if (vehicle === this.car || !vehicle.polygon) continue;
				const reach =
					Math.hypot(this.car.width, this.car.height) / 2 +
					Math.hypot(vehicle.width, vehicle.height) / 2;
				if (distance(pose.point, vehicle) > reach) continue;
				const footprint = vehiclePolygon(
					this.car,
					pose.point.x,
					pose.point.y,
					-angle(pose.direction) - Math.PI / 2,
				);
				if (polygonsOverlap(footprint, vehicle.polygon)) {
					nearest = { distance: travelled, vehicle };
					break;
				}
			}
			if (nearest) break;
		}
		return nearest;
	}

	#getReading(ray, roadBorders, traffic) {
		// Keep only the nearest hit: no temporary hit/offset arrays per ray.
		let nearest = null;

		for (let itemIndex = 0; itemIndex < roadBorders.length; itemIndex++) {
			const touch = getIntersection(
				ray[0],
				ray[1],
				roadBorders[itemIndex][0],
				roadBorders[itemIndex][1],
			);
			if (touch && (!nearest || touch.offset < nearest.offset)) nearest = touch;
		}

		for (let itemIndex = 0; itemIndex < traffic.length; itemIndex++) {
			const otherCar = traffic[itemIndex];
			if (otherCar === this.car || !otherCar.polygon) continue;
			const poly = otherCar.polygon;
			for (let nextItemIndex = 0; nextItemIndex < poly.length; nextItemIndex++) {
				const value = getIntersection(
					ray[0],
					ray[1],
					poly[nextItemIndex],
					poly[(nextItemIndex + 1) % poly.length],
				);
				if (value && (!nearest || value.offset < nearest.offset))
					nearest = { ...value, vehicleId: otherCar.id };
			}
		}

		return nearest;
	}

	#castRays() {
		this.rays = [];
		for (let itemIndex = 0; itemIndex < this.rayCount; itemIndex++) {
			const rayAngle =
				lerp(
					this.raySpread / 2,
					-this.raySpread / 2,
					this.rayCount == 1 ? 0.5 : itemIndex / (this.rayCount - 1),
				) + this.car.angle;

			const start = { x: this.car.x, y: this.car.y };
			const end = {
				x: this.car.x - Math.sin(rayAngle) * this.rayLength,
				y: this.car.y - Math.cos(rayAngle) * this.rayLength,
			};
			this.rays.push([start, end]);
		}
	}

	draw(ctx) {
		for (let itemIndex = 0; itemIndex < this.rayCount; itemIndex++) {
			let end = this.rays[itemIndex][1];
			if (this.readings[itemIndex]) {
				end = this.readings[itemIndex];
			}

			ctx.beginPath();
			ctx.lineWidth = 2;
			ctx.strokeStyle = "yellow";
			ctx.moveTo(this.rays[itemIndex][0].x, this.rays[itemIndex][0].y);
			ctx.lineTo(end.x, end.y);
			ctx.stroke();

			ctx.beginPath();
			ctx.lineWidth = 2;
			ctx.strokeStyle = "black";
			ctx.moveTo(this.rays[itemIndex][1].x, this.rays[itemIndex][1].y);
			ctx.lineTo(end.x, end.y);
			ctx.stroke();
		}
	}
}
