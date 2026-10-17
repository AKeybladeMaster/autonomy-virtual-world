/* Shared visual models. x/y are fractions of vehicle width/length; z uses
   simulation units. Geometry never changes lane following or collision bounds. */
function vehicleStyle(car) {
  return VEHICLE_STYLES[(car.id || 0) % VEHICLE_STYLES.length];
}
function vehicleBraking(car) {
  return /yield|stop|road ends/i.test(car.status || "");
}

function paintVehicleTop(ctx, car, width, length) {
  const finish = VEHICLE_FINISH,
    style = vehicleStyle(car);
  const path = (points, fill, stroke) => {
    ctx.beginPath();
    points.forEach(([x, y], pointIndex) =>
      pointIndex
        ? ctx.lineTo(x * width, y * length)
        : ctx.moveTo(x * width, y * length),
    );
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }
  };
  const body = [
    [-0.34, -0.5],
    [0.34, -0.5],
    [0.46, -0.4],
    [0.46, 0.39],
    [0.34, 0.49],
    [-0.34, 0.49],
    [-0.46, 0.39],
    [-0.46, -0.4],
  ];
  ctx.save();
  ctx.translate(2, 3);
  path(body, "#10223745");
  ctx.restore();
  ctx.fillStyle = finish.tire;
  for (const side of [-1, 1])
    for (const y of [-0.3, 0.3]) {
      ctx.beginPath();
      ctx.roundRect(
        (side < 0 ? -0.5 : 0.36) * width,
        (y - 0.075) * length,
        0.14 * width,
        0.15 * length,
        1.5,
      );
      ctx.fill();
    }
  const paint = ctx.createLinearGradient(-width / 2, 0, width / 2, 0);
  paint.addColorStop(0, car.color || "#91b7ef");
  paint.addColorStop(0.38, "#edf6ff");
  paint.addColorStop(0.52, car.color || "#91b7ef");
  paint.addColorStop(1, car.color || "#91b7ef");
  path(body, paint, "#142c4640");
  const front = style.roofFront,
    rear = style.roofRear;
  path(
    [
      [-0.37, -0.27],
      [0.37, -0.27],
      [0.3, front],
      [-0.3, front],
    ],
    finish.glass,
  );
  path(
    [
      [-0.3, rear],
      [0.3, rear],
      [0.37, Math.min(0.4, rear + 0.12)],
      [-0.37, Math.min(0.4, rear + 0.12)],
    ],
    finish.glass,
  );
  path(
    [
      [-0.3, front],
      [0.3, front],
      [0.3, rear],
      [-0.3, rear],
    ],
    car.color || "#91b7ef",
    "#f2f7ff90",
  );
  for (const side of [-1, 1]) {
    path(
      [
        [side * 0.33, front + 0.025],
        [side * 0.41, -0.23],
        [side * 0.41, 0.25],
        [side * 0.33, rear - 0.02],
      ],
      finish.glass,
    );
    ctx.strokeStyle = finish.chrome;
    ctx.lineWidth = 0.65;
    ctx.beginPath();
    ctx.moveTo(side * 0.35 * width, -0.02 * length);
    ctx.lineTo(side * 0.42 * width, -0.02 * length);
    ctx.stroke();
    ctx.fillStyle = car.color;
    ctx.beginPath();
    ctx.roundRect(
      (side < 0 ? -0.5 : 0.41) * width,
      -0.19 * length,
      0.09 * width,
      0.045 * length,
      1,
    );
    ctx.fill();
    ctx.fillStyle = finish.headlamp;
    ctx.beginPath();
    ctx.roundRect(
      (side < 0 ? -0.35 : 0.12) * width,
      -0.465 * length,
      0.23 * width,
      0.038 * length,
      1,
    );
    ctx.fill();
    ctx.fillStyle = vehicleBraking(car) ? "#ff234c" : finish.taillamp;
    ctx.fillRect(
      (side < 0 ? -0.36 : 0.12) * width,
      0.436 * length,
      0.24 * width,
      0.036 * length,
    );
  }
  ctx.strokeStyle = "#ffffff70";
  ctx.lineWidth = 0.65;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 0.24 * width, -0.3 * length);
    ctx.lineTo(side * 0.29 * width, -0.42 * length);
    ctx.stroke();
  }
  ctx.fillStyle = finish.tire;
  ctx.fillRect(-0.16 * width, -0.49 * length, 0.32 * width, 0.025 * length);
  ctx.fillStyle = finish.chrome;
  ctx.fillRect(-0.1 * width, 0.452 * length, 0.2 * width, 0.025 * length);
}

function drawVehicleModel3D(car, unit, polygon, detailed = true) {
  const style = vehicleStyle(car),
    finish = VEHICLE_FINISH;
  const forward = { x: -Math.sin(car.angle), y: -Math.cos(car.angle) },
    right = { x: -forward.y, y: forward.x };
  const point = ([x, y, z]) => ({
    x: car.x + right.x * x * car.width - forward.x * y * car.height,
    y: car.y + right.y * x * car.width - forward.y * y * car.height,
    z: z * unit,
  });
  const face = (points, color, stroke) => polygon(points.map(point), color, stroke);
  const outline = [
    [-0.33, -0.5],
    [0.33, -0.5],
    [0.46, -0.4],
    [0.46, 0.39],
    [0.34, 0.49],
    [-0.34, 0.49],
    [-0.46, 0.39],
    [-0.46, -0.4],
  ];
  const bottom = outline.map(([x, y]) => [x, y, 0.003]),
    belt = outline.map(([x, y]) => [x, y, 0.0085]);
  // Chamfered body, lower sill and a sloping glass cabin instead of stacked boxes.
  for (let pointIndex = 0; pointIndex < outline.length; pointIndex++) {
    const nextPointIndex = (pointIndex + 1) % outline.length;
    face(
      [
        bottom[pointIndex],
        bottom[nextPointIndex],
        belt[nextPointIndex],
        belt[pointIndex],
      ],
      car.color,
      "#10213935",
    );
  }
  face(belt, car.color, "#ffffff30");
  const roof = [
    [-0.31, style.roofFront, style.roofHeight],
    [0.31, style.roofFront, style.roofHeight],
    [0.31, style.roofRear, style.roofHeight],
    [-0.31, style.roofRear, style.roofHeight],
  ];
  const cabin = [
    [-0.39, -0.28, 0.0086],
    [0.39, -0.28, 0.0086],
    [0.39, Math.min(0.41, style.roofRear + 0.14), 0.0086],
    [-0.39, Math.min(0.41, style.roofRear + 0.14), 0.0086],
  ];
  for (let pointIndex = 0; pointIndex < 4; pointIndex++) {
    const nextPointIndex = (pointIndex + 1) % 4;
    face(
      [
        cabin[pointIndex],
        cabin[nextPointIndex],
        roof[nextPointIndex],
        roof[pointIndex],
      ],
      pointIndex % 2 ? finish.glass : finish.glassLight,
      finish.chrome,
    );
  }
  face(roof, car.color, "#ffffff65");
  if (!detailed) return;
  for (const side of [-1, 1]) {
    // Center pillar, side sill, door handles and compact mirrors.
    face(
      [
        [side * 0.39, -0.025, 0.0088],
        [side * 0.39, 0.01, 0.0088],
        [side * 0.31, 0.01, style.roofHeight],
        [side * 0.31, -0.025, style.roofHeight],
      ],
      car.color,
    );
    face(
      [
        [side * 0.465, -0.23, 0.0038],
        [side * 0.465, 0.22, 0.0038],
        [side * 0.465, 0.22, 0.0045],
        [side * 0.465, -0.23, 0.0045],
      ],
      finish.chrome,
    );
    face(
      [
        [side * 0.465, 0.1, 0.0074],
        [side * 0.465, 0.17, 0.0074],
        [side * 0.465, 0.17, 0.0078],
        [side * 0.465, 0.1, 0.0078],
      ],
      finish.chrome,
    );
    face(
      [
        [side * 0.39, -0.21, 0.009],
        [side * 0.5, -0.19, 0.0085],
        [side * 0.5, -0.15, 0.0085],
        [side * 0.39, -0.15, 0.0095],
      ],
      car.color,
      finish.chrome,
    );
    const x0 = side < 0 ? -0.33 : 0.13,
      x1 = side < 0 ? -0.13 : 0.33;
    face(
      [
        [x0, -0.501, 0.006],
        [x1, -0.501, 0.006],
        [x1, -0.501, 0.0078],
        [x0, -0.501, 0.0078],
      ],
      finish.headlamp,
    );
    face(
      [
        [x0, 0.491, 0.006],
        [x1, 0.491, 0.006],
        [x1, 0.491, 0.0075],
        [x0, 0.491, 0.0075],
      ],
      vehicleBraking(car) ? "#ff234c" : finish.taillamp,
    );
    for (const centerY of [-0.3, 0.3]) {
      const outer = [],
        inner = [];
      for (let pointIndex = 0; pointIndex < 12; pointIndex++) {
        const angle = (pointIndex * Math.PI) / 6;
        outer.push([
          side * 0.495,
          centerY + (Math.cos(angle) * 0.0033 * unit) / car.height,
          0.0035 + Math.sin(angle) * 0.0033,
        ]);
        inner.push([
          side * 0.395,
          centerY + (Math.cos(angle) * 0.0033 * unit) / car.height,
          0.0035 + Math.sin(angle) * 0.0033,
        ]);
      }
      for (let pointIndex = 0; pointIndex < 12; pointIndex++) {
        const nextPointIndex = (pointIndex + 1) % 12;
        face(
          [
            outer[pointIndex],
            outer[nextPointIndex],
            inner[nextPointIndex],
            inner[pointIndex],
          ],
          finish.tire,
        );
      }
      face(outer, finish.tire);
      const rim = outer.map(([x, y, z]) => [
        x + side * 0.001,
        centerY + (y - centerY) * 0.64,
        0.0035 + (z - 0.0035) * 0.64,
      ]);
      face(rim, finish.alloy);
      for (let pointIndex = 0; pointIndex < 12; pointIndex += 2)
        face(
          [
            [side * 0.497, centerY, 0.0035],
            rim[pointIndex],
            rim[(pointIndex + 1) % 12],
          ],
          "#647b95",
        );
    }
  }
  face(
    [
      [-0.11, 0.493, 0.0039],
      [0.11, 0.493, 0.0039],
      [0.11, 0.493, 0.0054],
      [-0.11, 0.493, 0.0054],
    ],
    finish.chrome,
  );
  face(
    [
      [-0.21, -0.502, 0.0037],
      [0.21, -0.502, 0.0037],
      [0.21, -0.502, 0.005],
      [-0.21, -0.502, 0.005],
    ],
    finish.tire,
  );
}
