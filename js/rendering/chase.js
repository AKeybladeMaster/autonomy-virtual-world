/* Small perspective renderer using Canvas 2D; no 3D engine or external library. */
function clipNearPlane(points, near) {
  const result = [];
  for (let pointIndex = 0; pointIndex < points.length; pointIndex++) {
    const currentPoint = points[pointIndex],
      nextPoint = points[(pointIndex + 1) % points.length],
      currentPointIsInFront = currentPoint.z >= near,
      nextPointIsInFront = nextPoint.z >= near;
    if (currentPointIsInFront) result.push(currentPoint);
    if (currentPointIsInFront !== nextPointIsInFront) {
      const intersectionRatio =
        (near - currentPoint.z) / (nextPoint.z - currentPoint.z);
      result.push({
        x: lerp(currentPoint.x, nextPoint.x, intersectionRatio),
        y: lerp(currentPoint.y, nextPoint.y, intersectionRatio),
        z: near,
      });
    }
  }
  return result;
}
function chaseProjection(car, unit, width, height) {
  const forwardVector = {
      x: -Math.sin(car.angle),
      y: -Math.cos(car.angle),
    },
    rightVector = { x: -forwardVector.y, y: forwardVector.x };
  const position = {
      x: car.x - forwardVector.x * 0.16 * unit,
      y: car.y - forwardVector.y * 0.16 * unit,
      z: 0.085 * unit,
    },
    pitch = 0.24;
  const cosinePitch = Math.cos(pitch),
    sinePitch = Math.sin(pitch),
    focal = Math.min(width * 0.8, height * 0.92);
  return {
    near: 0.008 * unit,
    view(p) {
      const deltaX = p.x - position.x,
        deltaY = p.y - position.y,
        deltaZ = (p.z || 0) - position.z,
        forwardDistance = deltaX * forwardVector.x + deltaY * forwardVector.y;
      return {
        x: deltaX * rightVector.x + deltaY * rightVector.y,
        y: deltaZ * cosinePitch + forwardDistance * sinePitch,
        z: forwardDistance * cosinePitch - deltaZ * sinePitch,
      };
    },
    screen(p) {
      return {
        x: width / 2 + (p.x / p.z) * focal,
        y: height * 0.43 - (p.y / p.z) * focal,
      };
    },
  };
}
let chaseRoadCache = null;
function drawChaseView(canvas, world, car, state) {
  const rect = canvas.getBoundingClientRect(),
    viewportWidth = rect.width,
    viewportHeight = rect.height;
  if (!viewportWidth || !viewportHeight) return;
  const ratio = Math.min(devicePixelRatio || 1, 2),
    pw = Math.round(viewportWidth * ratio),
    ph = Math.round(viewportHeight * ratio);
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw;
    canvas.height = ph;
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  const dark = state.theme === "dark",
    theme = CANVAS_THEMES[state.theme];
  const sky = ctx.createLinearGradient(0, 0, 0, viewportHeight);
  sky.addColorStop(0, dark ? "#070b21" : "#b8d8fa");
  sky.addColorStop(0.5, dark ? "#33335a" : "#f4f9ff");
  sky.addColorStop(1, theme.background);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, viewportWidth, viewportHeight);
  if (!car) {
    ctx.fillStyle = theme.text;
    ctx.font = "14px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(
      "Choose a driver when cars are ready",
      viewportWidth / 2,
      viewportHeight / 2,
    );
    return;
  }
  const unit = world.roadWidth / SIMULATION.ROAD_WIDTH,
    projection = chaseProjection(car, unit, viewportWidth, viewportHeight),
    faces = [];
  const polygon = (points, color, stroke = null, queue = true) => {
    let points3 = clipNearPlane(
      points.map((p) => projection.view(p)),
      projection.near,
    );
    if (points3.length < 3) return;
    const screen = points3.map((p) => projection.screen(p));
    if (
      screen.every((p) => p.x < 0) ||
      screen.every((p) => p.x > viewportWidth) ||
      screen.every((p) => p.y < 0) ||
      screen.every((p) => p.y > viewportHeight)
    )
      return;
    const face = {
      points: screen,
      color,
      stroke,
      depth: points3.reduce((sum, p) => sum + p.z, 0) / points3.length,
    };
    if (queue) faces.push(face);
    else paint(face);
  };
  function paint(face) {
    ctx.beginPath();
    face.points.forEach((p, pointIndex) =>
      pointIndex ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y),
    );
    ctx.closePath();
    ctx.fillStyle = face.color;
    ctx.fill();
    if (face.stroke) {
      ctx.strokeStyle = face.stroke;
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }
  }
  polygon(
    [
      { x: car.x - 8 * unit, y: car.y - 8 * unit },
      { x: car.x + 8 * unit, y: car.y - 8 * unit },
      { x: car.x + 8 * unit, y: car.y + 8 * unit },
      { x: car.x - 8 * unit, y: car.y + 8 * unit },
    ],
    dark ? "#111b2a" : "#d3e3df",
    null,
    false,
  );
  if (
    !chaseRoadCache ||
    chaseRoadCache.world !== world ||
    chaseRoadCache.version !== world.networkVersion ||
    distance(car, chaseRoadCache.center) > 0.4 * unit
  ) {
    chaseRoadCache = {
      world,
      version: world.networkVersion,
      center: { x: car.x, y: car.y },
      roads: nearbyRoadSegments(world, car.x, car.y, 3 * unit),
    };
  }
  function roadStrip(segmentStart, segmentEnd, roadWidth, color) {
    const segmentLength = distance(segmentStart, segmentEnd),
      halfWidthX = ((-(segmentEnd.y - segmentStart.y) / segmentLength) * roadWidth) / 2,
      halfWidthY = (((segmentEnd.x - segmentStart.x) / segmentLength) * roadWidth) / 2;
    polygon(
      [
        { x: segmentStart.x + halfWidthX, y: segmentStart.y + halfWidthY },
        { x: segmentEnd.x + halfWidthX, y: segmentEnd.y + halfWidthY },
        { x: segmentEnd.x - halfWidthX, y: segmentEnd.y - halfWidthY },
        { x: segmentStart.x - halfWidthX, y: segmentStart.y - halfWidthY },
      ],
      color,
      null,
      false,
    );
  }
  for (const road of chaseRoadCache.roads)
    roadStrip(
      road.startPoint,
      road.endPoint,
      road.isDrivable ? world.roadWidth + 0.012 * unit : 0.014 * unit,
      theme.curb,
    );
  for (const road of chaseRoadCache.roads)
    roadStrip(
      road.startPoint,
      road.endPoint,
      road.isDrivable ? world.roadWidth : 0.01 * unit,
      road.isDrivable ? theme.road : theme.trail,
    );
  for (const road of chaseRoadCache.roads)
    if (road.isDrivable) {
      const roadLength = distance(road.startPoint, road.endPoint),
        dashSpacing = 0.08 * unit;
      const directionX = (road.endPoint.x - road.startPoint.x) / roadLength,
        directionY = (road.endPoint.y - road.startPoint.y) / roadLength,
        carDistanceAlongRoad =
          (car.x - road.startPoint.x) * directionX +
          (car.y - road.startPoint.y) * directionY;
      for (
        let dashDistance = Math.max(
          0,
          Math.floor((carDistanceAlongRoad - 3 * unit) / dashSpacing) * dashSpacing,
        );
        dashDistance < Math.min(roadLength, carDistanceAlongRoad + 3 * unit);
        dashDistance += dashSpacing
      ) {
        const dashEnd = Math.min(dashDistance + 0.035 * unit, roadLength);
        roadStrip(
          {
            x: road.startPoint.x + directionX * dashDistance,
            y: road.startPoint.y + directionY * dashDistance,
          },
          {
            x: road.startPoint.x + directionX * dashEnd,
            y: road.startPoint.y + directionY * dashEnd,
          },
          0.0015 * unit,
          theme.line,
        );
      }
    }
  function box(base, height, color, roof, z = 0, windows = false) {
    const top = base.map((p) => ({ ...p, z: height + z })),
      bottom = base.map((p) => ({ ...p, z }));
    for (let pointIndex = 0; pointIndex < 4; pointIndex++) {
      const nextPointIndex = (pointIndex + 1) % 4;
      polygon(
        [
          bottom[pointIndex],
          bottom[nextPointIndex],
          top[nextPointIndex],
          top[pointIndex],
        ],
        color[pointIndex % color.length],
      );
      if (windows) {
        const levels = Math.max(1, Math.floor(height / (0.04 * unit)));
        for (let floor = 0; floor < levels; floor++) {
          const windowStart = lerp2D(base[pointIndex], base[nextPointIndex], 0.19),
            windowEnd = lerp2D(base[pointIndex], base[nextPointIndex], 0.81),
            windowBottom = ((floor + 0.38) * height) / levels,
            windowTop = ((floor + 0.62) * height) / levels;
          polygon(
            [
              { ...windowStart, z: windowBottom },
              { ...windowEnd, z: windowBottom },
              { ...windowEnd, z: windowTop },
              { ...windowStart, z: windowTop },
            ],
            dark ? "#879dc9" : "#6684a3",
          );
        }
      }
    }
    polygon(top, roof);
  }
  if (state.scenery) {
    if (world.kind === "country") {
      const items = roadsideScenery(world).around(car.x, car.y, 2.4 * unit);
      for (const item of items) {
        if (item.type === "building")
          box(
            sceneryCorners(item),
            item.height,
            dark ? ["#273a55", "#343356"] : ["#bacfe1", "#dae5f0"],
            dark ? "#59517d" : "#ebedf6",
            0,
            true,
          );
        else {
          const treeBase = sceneryCorners({
            ...item,
            width: item.width * 0.12,
            depth: item.depth * 0.12,
          });
          box(treeBase, item.height * 0.55, ["#68756f"], "#758379");
          const center = { x: item.x, y: item.y, z: item.height },
            lower = { x: item.x, y: item.y, z: item.height * 0.24 };
          const ring = Array.from({ length: 7 }, (_, pointIndex) => ({
            x: item.x + Math.cos((pointIndex * Math.PI * 2) / 7) * item.width * 0.6,
            y: item.y + Math.sin((pointIndex * Math.PI * 2) / 7) * item.width * 0.6,
            z: item.height * 0.58,
          }));
          for (let pointIndex = 0; pointIndex < 7; pointIndex++) {
            const next = ring[(pointIndex + 1) % 7];
            polygon(
              [ring[pointIndex], next, center],
              dark
                ? pointIndex % 2
                  ? "#315b64"
                  : "#3a6470"
                : pointIndex % 2
                  ? "#79a797"
                  : "#94baa5",
            );
            polygon([next, ring[pointIndex], lower], dark ? "#274650" : "#77a18f");
          }
        }
      }
    } else {
      for (const building of world.buildings)
        if (building.base.distanceToPoint(car) < 2.4 * unit)
          box(
            building.base.points,
            0.12 * unit,
            dark ? ["#273a55", "#343356"] : ["#bacfe1", "#dae5f0"],
            dark ? "#59517d" : "#ebedf6",
            0,
            true,
          );
      for (const tree of world.trees)
        if (distance(tree.center, car) < 2.4 * unit) {
          const item = {
            ...tree.center,
            width: tree.size * 0.4,
            depth: tree.size * 0.4,
            angle: 0,
          };
          box(
            sceneryCorners(item),
            0.08 * unit,
            [dark ? "#315b64" : "#79a797"],
            dark ? "#3a6470" : "#94baa5",
          );
        }
    }
  }
  const cars = [
    car,
    ...state.cars.filter((c) => c.id !== car.id && distance(c, car) < 2.4 * unit),
  ];
  for (const vehicle of cars) {
    drawVehicleModel3D(
      vehicle,
      unit,
      polygon,
      vehicle.id === car.id || distance(vehicle, car) < 0.6 * unit,
    );
  }
  faces.sort((farFace, nearFace) => nearFace.depth - farFace.depth);
  for (const face of faces) paint(face);
  ctx.fillStyle = dark ? "#11192ee8" : "#ffffffe8";
  ctx.beginPath();
  ctx.roundRect(18, 54, Math.min(260, viewportWidth - 36), 47, 8);
  ctx.fill();
  ctx.fillStyle = theme.text;
  ctx.font = "600 12px system-ui";
  ctx.textAlign = "left";
  ctx.fillText(car.name, 30, 74, Math.max(10, viewportWidth - 66));
  ctx.fillStyle = theme.main;
  ctx.font = "11px system-ui";
  ctx.fillText(
    `${((car.speed / unit) * 360).toFixed(0)} km/h · ${car.status}`,
    30,
    91,
    Math.max(10, viewportWidth - 66),
  );
}
