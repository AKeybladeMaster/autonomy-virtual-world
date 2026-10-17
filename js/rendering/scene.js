/* Canvas-only presentation: no images, rendering engines, or UI libraries. */
let terrainCache = null,
  minimapCache = null;

function drawCar(ctx, car, selected = false, sensors = false) {
  if (sensors && car.sensor?.rays.length) {
    for (let itemIndex = 0; itemIndex < car.sensor.rays.length; itemIndex++) {
      const [rayStart, rayEnd] = car.sensor.rays[itemIndex];
      const hitPoint = car.sensor.readings[itemIndex] || rayEnd;
      new Segment(rayStart, rayEnd).draw(ctx, {
        color: "#68cfff25",
        width: car.width * 0.045,
      });
      new Segment(rayStart, hitPoint).draw(ctx, {
        color: "#68cfffbb",
        width: car.width * 0.055,
      });
      ctx.fillStyle = "#b6eaff";
      ctx.beginPath();
      ctx.arc(hitPoint.x, hitPoint.y, car.width * 0.08, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(-car.angle);
  const unit = car.width / 22;
  ctx.scale(unit, unit);
  const modelWidth = 22;
  const modelLength = car.height / unit;
  ctx.globalAlpha = car.damaged ? 0.28 : 1;
  if (selected) {
    ctx.strokeStyle = "#effaca80";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, 29, 0, Math.PI * 2);
    ctx.stroke();
  }
  paintVehicleTop(ctx, car, modelWidth, modelLength);
  ctx.restore();
}

function drawBuilding(ctx, building, view, mode = "light") {
  const dark = mode === "dark";
  const base = building.base.points;
  const seed = Math.abs(Math.floor(base[0].x * 13 + base[0].y * 7));
  const height = 30 + (seed % 40);
  const top = base.map((p) => getFake3dPoint(p, view, height));
  ctx.save();
  const shadow = base.map((p) => new Point(p.x + height * 0.7, p.y + height * 0.7));
  new Polygon(shadow).draw(ctx, { fill: "#50634725", stroke: "transparent" });
  new Polygon(base).draw(ctx, {
    fill: dark ? "#182440" : "#dce9f3",
    stroke: dark ? "#7d69c655" : "#9bbad660",
    lineWidth: 9,
    join: "round",
  });
  for (let itemIndex = 0; itemIndex < base.length; itemIndex++) {
    const nextItemIndex = (itemIndex + 1) % base.length;
    new Polygon([
      base[itemIndex],
      base[nextItemIndex],
      top[nextItemIndex],
      top[itemIndex],
    ]).draw(ctx, {
      fill: dark
        ? itemIndex % 2
          ? "#1c2947"
          : "#2b3b60"
        : itemIndex % 2
          ? "#b8cce0"
          : "#e6f0fb",
      stroke: dark ? "#596697" : "#aabdd3",
      lineWidth: 1,
    });
  }
  const roofColors = dark
    ? ["#343452", "#3b315b", "#273854", "#2b4163", "#493760"]
    : ["#d4e2f4", "#c9d9ef", "#c8e4ed", "#dcd7ee", "#e1e9f7"];
  new Polygon(top).draw(ctx, {
    fill: roofColors[seed % roofColors.length],
    stroke: dark ? "#7b83bf" : "#f2f7ff",
    lineWidth: 3,
    join: "round",
  });
  const center = scale(
    top.reduce((sum, p) => add(sum, p), new Point(0, 0)),
    1 / top.length,
  );
  const inset = top.map((p) => lerp2D(p, center, 0.22));
  new Polygon(inset).draw(ctx, {
    fill: "#ffffff08",
    stroke: "#5e72552b",
    lineWidth: 1.3,
  });
  if (top.length === 4) {
    const firstEdgeStart = lerp2D(top[0], top[1], 0.28);
    const oppositeEdgeStart = lerp2D(top[3], top[2], 0.28);
    const firstEdgeEnd = lerp2D(top[0], top[1], 0.51);
    const oppositeEdgeEnd = lerp2D(top[3], top[2], 0.51);
    const panel = [
      lerp2D(firstEdgeStart, oppositeEdgeStart, 0.3),
      lerp2D(firstEdgeEnd, oppositeEdgeEnd, 0.3),
      lerp2D(firstEdgeEnd, oppositeEdgeEnd, 0.6),
      lerp2D(firstEdgeStart, oppositeEdgeStart, 0.6),
    ];
    new Polygon(panel).draw(ctx, { fill: "#637d77", stroke: "#edf0de", lineWidth: 2 });
  }
  ctx.restore();
}

function drawTree(ctx, tree, mode = "light") {
  const { x, y } = tree.center;
  const treeRadius = tree.size * 0.36;
  ctx.fillStyle = "#51674722";
  ctx.beginPath();
  ctx.ellipse(
    x + treeRadius * 0.5,
    y + treeRadius * 0.5,
    treeRadius,
    treeRadius * 0.78,
    0.6,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  const tones =
    mode === "dark"
      ? ["#23435b", "#293b62", "#3b3659"]
      : ["#91b8c5", "#7ca8bc", "#a0c3d3"];
  ctx.fillStyle = tones[Math.abs(Math.floor(x + y)) % 3];
  ctx.beginPath();
  ctx.arc(x, y, treeRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#a6bb853b";
  ctx.beginPath();
  ctx.arc(
    x - treeRadius * 0.18,
    y - treeRadius * 0.2,
    treeRadius * 0.7,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  ctx.fillStyle = "#c3d39c25";
  ctx.beginPath();
  ctx.arc(
    x - treeRadius * 0.25,
    y - treeRadius * 0.32,
    treeRadius * 0.36,
    0,
    Math.PI * 2,
  );
  ctx.fill();
}

function drawWorldScene(ctx, world, camera, width, height, options) {
  const theme = CANVAS_THEMES[options.theme || "light"];
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, width, height);
  if (world.kind === "country") {
    const key = [
      camera.x,
      camera.y,
      camera.scale,
      width,
      height,
      options.theme,
      world.networkVersion,
    ].join(",");
    if (!terrainCache || terrainCache.world !== world || terrainCache.key !== key) {
      const layer = terrainCache?.canvas || document.createElement("canvas");
      layer.width = width;
      layer.height = height;
      const terrainContext = layer.getContext("2d");
      terrainContext.fillStyle = theme.background;
      terrainContext.fillRect(0, 0, width, height);
      terrainContext.translate(width / 2, height / 2);
      terrainContext.scale(camera.scale, camera.scale);
      terrainContext.translate(-camera.x, -camera.y);
      drawCountryRoads(terrainContext, world, camera, width, height, theme);
      terrainCache = { world, key, canvas: layer };
    }
    ctx.drawImage(terrainCache.canvas, 0, 0, width, height);
  }
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.scale(camera.scale, camera.scale);
  ctx.translate(-camera.x, -camera.y);
  if (world.kind !== "country") {
    const left = camera.x - width / camera.scale / 2,
      top = camera.y - height / camera.scale / 2;
    ctx.fillStyle = theme.grid;
    for (let x = Math.floor(left / 60) * 60; x < left + width / camera.scale; x += 60) {
      for (
        let y = Math.floor(top / 60) * 60;
        y < top + height / camera.scale;
        y += 60
      ) {
        ctx.fillRect(x, y, 1.5 / camera.scale, 1.5 / camera.scale);
      }
    }
    for (const env of world.envelopes)
      env.draw(ctx, {
        fill: theme.curb,
        stroke: theme.curb,
        lineWidth: 23,
        join: "round",
      });
    for (const env of world.envelopes)
      env.draw(ctx, { fill: theme.road, stroke: theme.road, lineWidth: 0.5 });
    for (const border of world.roadBorders)
      border.draw(ctx, { color: theme.line, width: 2 });
    for (const seg of world.graph.segments)
      seg.draw(ctx, { color: theme.line, width: 2, dash: [14, 16] });
  }
  for (const mark of world.markings)
    if (options.editing || mark.type !== "start") mark.draw(ctx);
  const focus = options.focusCar || options.bestCar;
  for (const car of options.cars) {
    if (
      Math.abs(car.x - camera.x) > width / camera.scale / 2 + car.height ||
      Math.abs(car.y - camera.y) > height / camera.scale / 2 + car.height
    )
      continue;
    if (car.height * camera.scale < 4) {
      ctx.fillStyle = car.color;
      ctx.beginPath();
      ctx.arc(car.x, car.y, (car === focus ? 4 : 2.8) / camera.scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = theme.main;
      ctx.lineWidth = 1 / camera.scale;
      ctx.stroke();
    } else
      drawCar(ctx, car, car.id === focus?.id, car.id === focus?.id && options.sensors);
  }
  if (options.scenery) {
    if (world.kind === "country")
      drawRoadsideScenery(ctx, world, camera, width, height, options.theme);
    const radius = Math.hypot(width, height) / camera.scale / 2 + 200;
    const view = new Point(camera.x, camera.y);
    for (const tree of world.trees)
      if (distance(tree.center, view) < radius) drawTree(ctx, tree, options.theme);
    const buildings = world.buildings.filter(
      (b) => b.base.distanceToPoint(view) < radius,
    );
    buildings.sort(
      (a, b) => b.base.distanceToPoint(view) - a.base.distanceToPoint(view),
    );
    for (const building of buildings) drawBuilding(ctx, building, view, options.theme);
  }
  if (options.editing) {
    for (const seg of world.graph.segments)
      seg.draw(ctx, { color: "#dcf1b680", width: 1 / camera.scale });
    for (const p of world.graph.points) {
      ctx.beginPath();
      ctx.arc(
        p.x,
        p.y,
        (p === options.selected ? 6 : 3.5) / camera.scale,
        0,
        Math.PI * 2,
      );
      ctx.fillStyle = p === options.selected ? "#f6e9a6" : "#dcebb6";
      ctx.fill();
      ctx.strokeStyle = "#436246";
      ctx.lineWidth = 1.5 / camera.scale;
      ctx.stroke();
    }
    if (options.selected && options.pointer && options.tool === "roads") {
      new Segment(options.selected, options.pointer).draw(ctx, {
        color: "#e8f4c6",
        width: 2 / camera.scale,
        dash: [6 / camera.scale, 6 / camera.scale],
      });
    }
    if (options.intent) {
      ctx.globalAlpha = 0.7;
      options.intent.draw(ctx);
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();
  if (options.tags) {
    ctx.save();
    ctx.font = "10px system-ui";
    ctx.textAlign = "center";
    const occupied = [];
    for (const car of [focus, ...options.cars.filter((c) => c !== focus)].filter(
      Boolean,
    )) {
      const x = (car.x - camera.x) * camera.scale + width / 2,
        y =
          (car.y - camera.y) * camera.scale +
          height / 2 -
          Math.max(8, car.height * camera.scale * 0.65);
      if (x < 0 || x > width || y < 0 || y > height) continue;
      const tagWidth = ctx.measureText(car.name || "Driver").width + 14;
      const tagHeight = 19;
      const tagBounds = {
        x: x - tagWidth / 2,
        y: y - 18,
        width: tagWidth,
        height: tagHeight,
      };
      if (
        occupied.some(
          (occupiedTag) =>
            tagBounds.x < occupiedTag.x + occupiedTag.width + 3 &&
            tagBounds.x + tagBounds.width > occupiedTag.x - 3 &&
            tagBounds.y < occupiedTag.y + occupiedTag.height + 2 &&
            tagBounds.y + tagBounds.height > occupiedTag.y - 2,
        )
      )
        continue;
      occupied.push(tagBounds);
      ctx.fillStyle = theme.label;
      ctx.beginPath();
      ctx.roundRect(x - tagWidth / 2, y - 18, tagWidth, 17, 4);
      ctx.fill();
      ctx.fillStyle = car === focus ? theme.main : theme.text;
      ctx.fillText(car.name || "Driver", x, y - 6);
      if (occupied.length >= 160) break;
    }
    ctx.restore();
  }
}

function drawNetwork(canvas, brain, mode = "light") {
  const ctx = canvas.getContext("2d");
  const canvasWidth = canvas.width;
  const canvasHeight = canvas.height;
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  if (!brain) return;
  const layers = [
    brain.levels[0].inputs,
    brain.levels[0].outputs,
    brain.levels[1].outputs,
  ];
  const neuronPosition = (layerIndex, neuronIndex) => ({
    x: 32 + (layerIndex * (canvasWidth - 64)) / 2,
    y: 20 + (neuronIndex * (canvasHeight - 40)) / (layers[layerIndex].length - 1),
  });
  brain.levels.forEach((level, layerIndex) => {
    level.weights.forEach((row, neuronIndex) =>
      row.forEach((weight, nextItemIndex) => {
        const sourcePosition = neuronPosition(layerIndex, neuronIndex);
        const targetPosition = neuronPosition(layerIndex + 1, nextItemIndex);
        const active = level.inputs[neuronIndex] > 0.1 && Math.abs(weight) > 0.1;
        ctx.beginPath();
        ctx.moveTo(sourcePosition.x, sourcePosition.y);
        ctx.lineTo(targetPosition.x, targetPosition.y);
        ctx.strokeStyle = active
          ? weight > 0
            ? "#549bdd99"
            : "#a37ce899"
          : mode === "dark"
            ? "#52628a33"
            : "#94b0ce33";
        ctx.lineWidth = active ? 1.3 : 0.7;
        ctx.stroke();
      }),
    );
  });
  layers.forEach((values, layerIndex) =>
    values.forEach((value, neuronIndex) => {
      const neuronCenter = neuronPosition(layerIndex, neuronIndex);
      ctx.beginPath();
      ctx.arc(neuronCenter.x, neuronCenter.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = value > 0.1 ? "#778bff" : mode === "dark" ? "#29344f" : "#cfdef0";
      ctx.fill();
      ctx.strokeStyle = mode === "dark" ? "#15213c" : "#f4f9ff";
      ctx.lineWidth = 2;
      ctx.stroke();
      if (layerIndex === 2) {
        ctx.fillStyle = "#829177";
        ctx.font = "9px sans-serif";
        ctx.fillText(
          ["↑", "←", "→", "↓"][neuronIndex],
          neuronCenter.x + 12,
          neuronCenter.y + 3,
        );
      }
    }),
  );
}

function graphBounds(graph) {
  if (graph.bounds) return graph.bounds;
  if (!graph.points.length) return { x: 0, y: 0, width: 1000, height: 800 };
  const xs = graph.points.map((p) => p.x),
    ys = graph.points.map((p) => p.y);
  const minX = Math.min(...xs) - 240,
    maxX = Math.max(...xs) + 240;
  const minY = Math.min(...ys) - 240,
    maxY = Math.max(...ys) + 240;
  return {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function drawMiniMap(canvas, world, camera, cars, width, height, mode = "light") {
  const ctx = canvas.getContext("2d");
  const canvasWidth = canvas.width;
  const canvasHeight = canvas.height;
  const bounds = graphBounds(world.graph);
  const mapScale = Math.min(canvasWidth / bounds.width, canvasHeight / bounds.height);
  const theme = CANVAS_THEMES[mode];
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  if (world.kind === "country") {
    if (!minimapCache || minimapCache.world !== world || minimapCache.mode !== mode) {
      const layer = document.createElement("canvas");
      layer.width = canvasWidth;
      layer.height = canvasHeight;
      const mapContext = layer.getContext("2d");
      mapContext.fillStyle = theme.background;
      mapContext.fillRect(0, 0, canvasWidth, canvasHeight);
      mapContext.translate(canvasWidth / 2, canvasHeight / 2);
      mapContext.scale(mapScale, mapScale);
      mapContext.translate(-bounds.x, -bounds.y);
      const paths = countryPaths(world);
      mapContext.fillStyle = theme.land;
      mapContext.fill(paths.outline);
      mapContext.strokeStyle = theme.main;
      mapContext.lineWidth = 0.6 / mapScale;
      mapContext.stroke(paths.main);
      mapContext.strokeStyle = theme.secondary;
      mapContext.lineWidth = 0.3 / mapScale;
      mapContext.stroke(paths.secondary);
      minimapCache = { world, mode, canvas: layer };
    }
    ctx.drawImage(minimapCache.canvas, 0, 0);
  }
  ctx.save();
  ctx.translate(canvasWidth / 2, canvasHeight / 2);
  ctx.scale(mapScale, mapScale);
  ctx.translate(-bounds.x, -bounds.y);
  for (const seg of world.graph.segments)
    seg.draw(ctx, { color: theme.main, width: world.roadWidth * 0.7, cap: "round" });
  ctx.fillStyle = theme.main;
  for (const car of cars)
    if (!car.damaged) {
      ctx.beginPath();
      ctx.arc(car.x, car.y, 1.7 / mapScale, 0, Math.PI * 2);
      ctx.fill();
    }
  ctx.strokeStyle = mode === "dark" ? "#b294ff" : "#436bd3";
  ctx.lineWidth = 1 / mapScale;
  ctx.strokeRect(
    camera.x - width / camera.scale / 2,
    camera.y - height / camera.scale / 2,
    width / camera.scale,
    height / camera.scale,
  );
  ctx.restore();
}
