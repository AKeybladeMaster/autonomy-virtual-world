/* Country geometry stays compact. Rendering uses a spatial index and cached paths. */
class CountryWorld {
  constructor(data) {
    this.kind = "country";
    this.dataset = "albania";
    this.name = "Albania";
    this.data = data;
    this.roadWidth = SIMULATION.ROAD_WIDTH;
    this.metresPerUnit = 100;
    this.graph = new Graph();
    this.envelopes = [];
    this.roadBorders = [];
    this.markings = [];
    this.buildings = [];
    this.trees = [];
    this.laneGuides = [];
    this.roadGrid = new SpatialGrid(20);
    this.networkVersion = 0;
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    this.roads = data.roads.map((r, id) => {
      const road = {
        id,
        osmId: r[0],
        type: data.classes[r[1]],
        oneWay: r[2],
        refs: r[3],
        name: r[4],
        drivable: !!r[5],
      };
      let x0 = Infinity,
        y0 = Infinity,
        x1 = -Infinity,
        y1 = -Infinity;
      for (const ref of road.refs) {
        const [x, y] = data.nodes[ref];
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
      road.bounds = [x0, y0, x1, y1];
      this.roadGrid.add(id, x0, y0, x1, y1);
      minX = Math.min(minX, x0);
      minY = Math.min(minY, y0);
      maxX = Math.max(maxX, x1);
      maxY = Math.max(maxY, y1);
      return road;
    });
    this.bounds = {
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
      width: maxX - minX + 80,
      height: maxY - minY + 80,
    };
    this.graph.bounds = this.bounds;
  }
  visibleRoads(camera, width, height) {
    if (camera.scale < 2) return this.roads;
    const rx = width / camera.scale / 2 + 0.2,
      ry = height / camera.scale / 2 + 0.2;
    return this.roadGrid
      .query(camera.x - rx, camera.y - ry, camera.x + rx, camera.y + ry)
      .map((itemIndex) => this.roads[itemIndex]);
  }
  generate() {
    // Additive editor layer; the bundled OSM source remains intact.
    this.envelopes = [];
    this.laneGuides = [];
    this.roadBorders = [];
    for (const s of this.graph.segments) {
      this.envelopes.push(new Envelope(s, this.roadWidth, 4));
      const n = scale(perpendicular(s.directionVector()), this.roadWidth / 4);
      this.laneGuides.push(
        new Segment(add(s.p1, n), add(s.p2, n)),
        new Segment(subtract(s.p1, n), subtract(s.p2, n)),
      );
    }
    this.networkVersion++;
  }
}

function countryPaths(world) {
  if (world.paths) return world.paths;
  const paths = {
    main: new Path2D(),
    secondary: new Path2D(),
    local: new Path2D(),
    trails: new Path2D(),
    outline: new Path2D(),
  };
  for (const road of world.roads) {
    const group = /^(motorway|trunk|primary)/.test(road.type)
      ? "main"
      : /^(secondary|tertiary)/.test(road.type)
        ? "secondary"
        : road.drivable
          ? "local"
          : "trails";
    const path = paths[group];
    road.refs.forEach((ref, itemIndex) => {
      const p = world.data.nodes[ref];
      if (itemIndex === 0) path.moveTo(...p);
      else path.lineTo(...p);
    });
  }
  for (const ring of world.data.outline) {
    ring.forEach((p, itemIndex) =>
      itemIndex ? paths.outline.lineTo(...p) : paths.outline.moveTo(...p),
    );
    paths.outline.closePath();
  }
  world.paths = paths;
  return paths;
}

function drawCountryRoads(ctx, world, camera, width, height, theme) {
  const paths = countryPaths(world),
    scale = camera.scale;
  ctx.fillStyle = theme.land;
  ctx.fill(paths.outline);
  ctx.strokeStyle = theme.outline;
  ctx.lineWidth = 1 / scale;
  ctx.stroke(paths.outline);
  if (scale < 8) {
    // Raster cache is invalidated only by camera, viewport, or theme changes.
    for (const [group, color, lineWidth] of [
      ["trails", theme.trail, 0.35],
      ["local", theme.local, 0.55],
      ["secondary", theme.secondary, 0.85],
      ["main", theme.main, 1.25],
    ]) {
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth / scale;
      ctx.stroke(paths[group]);
    }
  } else {
    const roads = world.visibleRoads(camera, width, height);
    const trace = (road) => {
      ctx.beginPath();
      road.refs.forEach((ref, itemIndex) => {
        const p = world.data.nodes[ref];
        itemIndex ? ctx.lineTo(...p) : ctx.moveTo(...p);
      });
    };
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    for (const road of roads) {
      trace(road);
      ctx.strokeStyle = road.drivable ? theme.curb : theme.trail;
      ctx.lineWidth = road.drivable ? world.roadWidth + 2 / scale : 1 / scale;
      ctx.stroke();
    }
    for (const road of roads)
      if (road.drivable) {
        trace(road);
        ctx.strokeStyle = theme.road;
        ctx.lineWidth = world.roadWidth;
        ctx.stroke();
      }
    if (scale > 40)
      for (const road of roads)
        if (road.drivable) {
          trace(road);
          ctx.strokeStyle = theme.line;
          ctx.lineWidth = 0.002;
          ctx.setLineDash(road.oneWay ? [] : [0.035, 0.035]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
  }
  for (const env of world.envelopes)
    env.draw(ctx, { fill: theme.road, stroke: theme.line, lineWidth: 0.002 });
}
