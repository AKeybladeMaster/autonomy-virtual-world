/* Fictional roadside scenery, generated deterministically near the camera only. */
function sceneryHash(roadId, segmentIndex = 0, sampleIndex = 0) {
  let hash =
    Math.imul(roadId ^ 0x9e3779b9, 0x85ebca6b) ^
    Math.imul(segmentIndex, 0xc2b2ae35) ^
    sampleIndex;
  hash = Math.imul(hash ^ (hash >>> 16), 0x7feb352d);
  return (hash ^ (hash >>> 15)) >>> 0;
}
function nearbyRoadSegments(world, centerX, centerY, searchRadius) {
  const roadSegments = [];
  const append = (startPoint, endPoint, roadId, segmentIndex, isDrivable = true) => {
    if (
      Math.max(startPoint.x, endPoint.x) < centerX - searchRadius ||
      Math.min(startPoint.x, endPoint.x) > centerX + searchRadius ||
      Math.max(startPoint.y, endPoint.y) < centerY - searchRadius ||
      Math.min(startPoint.y, endPoint.y) > centerY + searchRadius
    )
      return;
    if (distance(startPoint, endPoint) > 1e-7)
      roadSegments.push({ startPoint, endPoint, roadId, segmentIndex, isDrivable });
  };
  if (world.kind === "country") {
    for (const id of world.roadGrid.query(
      centerX - searchRadius,
      centerY - searchRadius,
      centerX + searchRadius,
      centerY + searchRadius,
    )) {
      const road = world.roads[id],
        bounds = road.bounds;
      if (
        bounds[2] < centerX - searchRadius ||
        bounds[0] > centerX + searchRadius ||
        bounds[3] < centerY - searchRadius ||
        bounds[1] > centerY + searchRadius
      )
        continue;
      for (let segmentIndex = 1; segmentIndex < road.refs.length; segmentIndex++)
        append(
          new Point(...world.data.nodes[road.refs[segmentIndex - 1]]),
          new Point(...world.data.nodes[road.refs[segmentIndex]]),
          id,
          segmentIndex,
          road.drivable,
        );
    }
  }
  world.graph.segments.forEach((segment, segmentIndex) =>
    append(segment.p1, segment.p2, 1000000 + segmentIndex, 0, true),
  );
  return roadSegments;
}
function segmentDistance(point, segmentStart, segmentEnd) {
  const deltaX = segmentEnd.x - segmentStart.x,
    deltaY = segmentEnd.y - segmentStart.y,
    t = Math.max(
      0,
      Math.min(
        1,
        ((point.x - segmentStart.x) * deltaX + (point.y - segmentStart.y) * deltaY) /
          (deltaX * deltaX + deltaY * deltaY),
      ),
    );
  return Math.hypot(
    point.x - segmentStart.x - t * deltaX,
    point.y - segmentStart.y - t * deltaY,
  );
}
function sceneryCorners(item) {
  const forward = { x: Math.cos(item.angle), y: Math.sin(item.angle) },
    right = { x: -forward.y, y: forward.x };
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([localX, localY]) => ({
    x:
      item.x +
      (forward.x * localX * item.width) / 2 +
      (right.x * localY * item.depth) / 2,
    y:
      item.y +
      (forward.y * localX * item.width) / 2 +
      (right.y * localY * item.depth) / 2,
  }));
}
class RoadsideScenery {
  constructor(world) {
    this.world = world;
    this.unit = world.roadWidth / SIMULATION.ROAD_WIDTH;
    this.tileSize = 2 * this.unit;
    this.cache = new Map();
    this.version = world.networkVersion;
  }
  tile(tileX, tileY) {
    const key = `${tileX},${tileY}`;
    if (this.cache.has(key)) {
      const value = this.cache.get(key);
      this.cache.delete(key);
      this.cache.set(key, value);
      return value;
    }
    const simulationUnit = this.unit,
      tileSize = this.tileSize,
      centerX = (tileX + 0.5) * tileSize,
      centerY = (tileY + 0.5) * tileSize;
    const roadSegments = nearbyRoadSegments(
        this.world,
        centerX,
        centerY,
        tileSize * 0.5 + 0.8 * simulationUnit,
      ),
      roadGrid = new SpatialGrid(0.4 * simulationUnit);
    for (const road of roadSegments)
      roadGrid.add(
        road,
        Math.min(road.startPoint.x, road.endPoint.x),
        Math.min(road.startPoint.y, road.endPoint.y),
        Math.max(road.startPoint.x, road.endPoint.x),
        Math.max(road.startPoint.y, road.endPoint.y),
      );
    const candidates = [];
    for (const road of roadSegments) {
      const segmentLength = distance(road.startPoint, road.endPoint),
        directionX = (road.endPoint.x - road.startPoint.x) / segmentLength,
        directionY = (road.endPoint.y - road.startPoint.y) / segmentLength;
      const sampleSpacing = 0.32 * simulationUnit,
        phase =
          ((sceneryHash(road.roadId, road.segmentIndex) % 1000) / 1000) * sampleSpacing;
      // Restrict sampling even when an OSM segment is many kilometres long.
      const centerlineDistance =
        (centerX - road.startPoint.x) * directionX +
        (centerY - road.startPoint.y) * directionY;
      const firstSampleIndex = Math.max(
          0,
          Math.floor(
            (centerlineDistance - tileSize - simulationUnit - phase) / sampleSpacing,
          ),
        ),
        lastSampleIndex = Math.min(
          Math.floor((segmentLength - phase) / sampleSpacing),
          Math.ceil(
            (centerlineDistance + tileSize + simulationUnit - phase) / sampleSpacing,
          ),
        );
      for (
        let sampleIndex = firstSampleIndex;
        sampleIndex <= lastSampleIndex;
        sampleIndex++
      )
        for (const roadsideSide of [-1, 1]) {
          const scenerySeed = sceneryHash(
              road.roadId,
              road.segmentIndex,
              sampleIndex * 2 + (roadsideSide === 1 ? 1 : 0),
            ),
            alongDistance = phase + sampleIndex * sampleSpacing;
          if (alongDistance < 0 || alongDistance > segmentLength) continue;
          const type = scenerySeed % 3 === 0 || !road.isDrivable ? "tree" : "building";
          const objectWidth =
              (type === "tree" ? 0.065 : 0.09 + (scenerySeed % 7) * 0.011) *
              simulationUnit,
            objectDepth =
              (type === "tree" ? 0.065 : 0.085 + ((scenerySeed >>> 5) % 6) * 0.013) *
              simulationUnit;
          const clearanceRadius = Math.hypot(objectWidth, objectDepth) / 2,
            setback =
              this.world.roadWidth / 2 + clearanceRadius + 0.035 * simulationUnit;
          const item = {
            type,
            seed: scenerySeed,
            x:
              road.startPoint.x +
              directionX * alongDistance -
              directionY * setback * roadsideSide,
            y:
              road.startPoint.y +
              directionY * alongDistance +
              directionX * setback * roadsideSide,
            width: objectWidth,
            depth: objectDepth,
            height:
              (type === "tree" ? 0.09 : 0.06 + ((scenerySeed >>> 9) % 6) * 0.035) *
              simulationUnit,
            angle: Math.atan2(directionY, directionX),
            radius: clearanceRadius,
          };
          if (
            Math.abs(item.x - centerX) > tileSize * 0.5 + 0.3 * simulationUnit ||
            Math.abs(item.y - centerY) > tileSize * 0.5 + 0.3 * simulationUnit
          )
            continue;
          if (
            roadGrid
              .query(
                item.x - clearanceRadius - 0.05 * simulationUnit,
                item.y - clearanceRadius - 0.05 * simulationUnit,
                item.x + clearanceRadius + 0.05 * simulationUnit,
                item.y + clearanceRadius + 0.05 * simulationUnit,
              )
              .some(
                (nearbyRoad) =>
                  segmentDistance(item, nearbyRoad.startPoint, nearbyRoad.endPoint) <
                  clearanceRadius +
                    (nearbyRoad.isDrivable
                      ? this.world.roadWidth / 2
                      : 0.015 * simulationUnit) +
                    0.012 * simulationUnit,
              )
          )
            continue;
          candidates.push(item);
        }
    }
    // Halo candidates and a fixed priority prevent overlap across tile borders.
    const objectGrid = new SpatialGrid(0.3 * simulationUnit);
    for (const candidate of candidates)
      objectGrid.add(candidate, candidate.x, candidate.y);
    const result = candidates.filter(
      (candidate) =>
        Math.floor(candidate.x / tileSize) === tileX &&
        Math.floor(candidate.y / tileSize) === tileY &&
        !objectGrid
          .query(
            candidate.x - 0.3 * simulationUnit,
            candidate.y - 0.3 * simulationUnit,
            candidate.x + 0.3 * simulationUnit,
            candidate.y + 0.3 * simulationUnit,
          )
          .some(
            (neighbor) =>
              neighbor !== candidate &&
              (neighbor.seed < candidate.seed ||
                (neighbor.seed === candidate.seed &&
                  (neighbor.x < candidate.x ||
                    (neighbor.x === candidate.x && neighbor.y < candidate.y)))) &&
              distance(candidate, neighbor) <
                candidate.radius + neighbor.radius + 0.025 * simulationUnit,
          ),
    );
    this.cache.set(key, result);
    while (this.cache.size > 80) this.cache.delete(this.cache.keys().next().value);
    return result;
  }
  around(centerX, centerY, horizontalRadius, verticalRadius = horizontalRadius) {
    if (this.version !== this.world.networkVersion) {
      this.cache.clear();
      this.version = this.world.networkVersion;
    }
    const tileSize = this.tileSize,
      visibleTiles = [];
    for (
      let tileX = Math.floor((centerX - horizontalRadius) / tileSize);
      tileX <= Math.floor((centerX + horizontalRadius) / tileSize);
      tileX++
    )
      for (
        let tileY = Math.floor((centerY - verticalRadius) / tileSize);
        tileY <= Math.floor((centerY + verticalRadius) / tileSize);
        tileY++
      )
        visibleTiles.push({
          tileX,
          tileY,
          distanceToCenter: Math.hypot(
            (tileX + 0.5) * tileSize - centerX,
            (tileY + 0.5) * tileSize - centerY,
          ),
        });
    visibleTiles.sort(
      (firstTile, secondTile) =>
        firstTile.distanceToCenter - secondTile.distanceToCenter,
    );
    return visibleTiles
      .slice(0, 36)
      .flatMap((tileCoordinates) =>
        this.tile(tileCoordinates.tileX, tileCoordinates.tileY),
      )
      .filter(
        (object) =>
          Math.abs(object.x - centerX) < horizontalRadius + object.radius &&
          Math.abs(object.y - centerY) < verticalRadius + object.radius,
      );
  }
}
function roadsideScenery(world) {
  return world.roadsideScenery || (world.roadsideScenery = new RoadsideScenery(world));
}
function drawRoadsideScenery(ctx, world, camera, width, height, theme) {
  if (camera.scale < 120) return;
  const items = roadsideScenery(world).around(
    camera.x,
    camera.y,
    width / camera.scale / 2 + 0.3,
    height / camera.scale / 2 + 0.3,
  );
  const dark = theme === "dark";
  for (const item of items) {
    if (item.type === "tree") {
      drawTree(ctx, { center: item, size: item.width / 0.72 }, theme);
      continue;
    }
    const base = sceneryCorners(item),
      lift = item.height * 0.23;
    const top = base.map((p) => ({ x: p.x - lift * 0.45, y: p.y - lift }));
    new Polygon(base.map((p) => ({ x: p.x + lift, y: p.y + lift }))).draw(ctx, {
      fill: "#14233e20",
      stroke: "transparent",
      lineWidth: 0,
    });
    for (let itemIndex = 0; itemIndex < 4; itemIndex++)
      new Polygon([
        base[itemIndex],
        base[(itemIndex + 1) % 4],
        top[(itemIndex + 1) % 4],
        top[itemIndex],
      ]).draw(ctx, {
        fill: dark ? "#29364f" : "#a3bad1",
        stroke: "transparent",
        lineWidth: 0,
      });
    new Polygon(top).draw(ctx, {
      fill: dark
        ? ["#514876", "#344566", "#3b5274"][item.seed % 3]
        : ["#e2eaf5", "#d2e3ee", "#dcd9ec"][item.seed % 3],
      stroke: dark ? "#847eb2" : "#ffffff",
      lineWidth: 0.002,
    });
  }
}
