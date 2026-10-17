/* World serialization, validation and small OSM import. */
function worldData(world) {
  return {
    version: 2,
    name: cleanWorldName(world.name),
    kind: world.kind || "local",
    dataset: world.dataset,
    sourceHash: world.data?.sha256,
    graph: { points: world.graph.points, segments: world.graph.segments },
    roadWidth: world.roadWidth,
    roadRoundness: world.roadRoundness,
    buildingWidth: world.buildingWidth,
    buildingMinLength: world.buildingMinLength,
    spacing: world.spacing,
    treeSize: world.treeSize,
    trees: world.trees.map((tree) => ({ center: tree.center })),
    markings: world.markings.map((marking) => ({
      type: marking.type,
      center: marking.center,
      directionVector: marking.directionVector,
      width: marking.width,
      height: marking.height,
    })),
  };
}

function cleanWorldName(name) {
  return typeof name === "string" && name.trim()
    ? name.trim().slice(0, 80)
    : "Untitled world";
}
function worldFileName(name) {
  let value = cleanWorldName(name)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/[. ]+$/g, "");
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value))
    value = "World " + value;
  return (value || "Untitled world") + ".world";
}

function parseWorld(data) {
  const country = data?.kind === "country";
  if (
    country &&
    (data.dataset !== "albania" ||
      typeof window === "undefined" ||
      !window.ALBANIA_ROADS)
  )
    throw Error("This saved world requires the bundled Albania dataset.");
  const finitePoint = (point) =>
    point &&
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    Math.abs(point.x) < 1e7 &&
    Math.abs(point.y) < 1e7;
  if (
    !data?.graph ||
    !Array.isArray(data.graph.points) ||
    !Array.isArray(data.graph.segments)
  )
    throw Error("This file does not contain a world graph.");
  const { points: rawPoints, segments: rawSegments } = data.graph;
  if (rawPoints.length > 800 || rawSegments.length > 350)
    throw Error("Please use a smaller map (up to 350 road segments).");
  if (!rawPoints.every(finitePoint))
    throw Error("The map contains invalid coordinates.");
  const graph = new Graph();
  rawPoints.forEach((pointData) =>
    graph.tryAddPoint(new Point(pointData.x, pointData.y)),
  );
  for (const rawSegment of rawSegments) {
    if (!finitePoint(rawSegment.p1) || !finitePoint(rawSegment.p2))
      throw Error("A road has invalid endpoints.");
    const startPoint = graph.containsPoint(rawSegment.p1);
    const endPoint = graph.containsPoint(rawSegment.p2);
    if (!startPoint || !endPoint)
      throw Error("A road endpoint is missing from the graph.");
    if (distance(startPoint, endPoint) > (country ? 1e-5 : 1))
      graph.tryAddSegment(new Segment(startPoint, endPoint, !!rawSegment.oneWay));
  }
  const setting = (propertyName, defaultValue, minimumValue, maximumValue) =>
    Number.isFinite(data[propertyName])
      ? Math.max(minimumValue, Math.min(maximumValue, data[propertyName]))
      : defaultValue;
  const world = country
    ? new CountryWorld(window.ALBANIA_ROADS)
    : new World(
        graph,
        setting("roadWidth", 110, 50, 200),
        8,
        setting("buildingWidth", 100, 40, 250),
        setting("buildingMinLength", 110, 50, 300),
        setting("spacing", 40, 20, 100),
        setting("treeSize", 75, 30, 160),
      );
  if (country) {
    world.graph = graph;
    world.graph.bounds = world.bounds;
    world.generate();
  }
  world.name = cleanWorldName(data.name || (country ? "Albania" : "Garden district"));
  const allowedMarkingTypes = ["start", "parking", "stop", "yield", "target"];
  if (data.trees != null) {
    if (
      !Array.isArray(data.trees) ||
      data.trees.length > 3000 ||
      !data.trees.every((treeData) => finitePoint(treeData.center))
    )
      throw Error("Invalid tree geometry.");
    world.trees = data.trees.map(
      (treeData) =>
        new Tree(new Point(treeData.center.x, treeData.center.y), world.treeSize),
    );
  }
  if (
    data.markings != null &&
    (!Array.isArray(data.markings) || data.markings.length > 2000)
  )
    throw Error("Invalid markings list.");
  for (const markingData of data.markings || []) {
    if (!allowedMarkingTypes.includes(markingData.type)) continue;
    if (
      !finitePoint(markingData.center) ||
      !finitePoint(markingData.directionVector) ||
      magnitude(markingData.directionVector) < 0.001 ||
      !Number.isFinite(markingData.width) ||
      !Number.isFinite(markingData.height) ||
      markingData.width <= 0 ||
      markingData.height <= 0 ||
      markingData.width > 500 ||
      markingData.height > 500
    )
      throw Error("A marking has invalid geometry.");
    world.markings.push(
      Marking.load({
        ...markingData,
        directionVector: normalize(markingData.directionVector),
      }),
    );
  }
  return world;
}

function parseOsmGraph(data) {
  if (!Array.isArray(data?.elements))
    throw Error("Expected an Overpass JSON object with an elements array.");
  const nodes = new Map(
    data.elements
      .filter(
        (nodeElement) =>
          nodeElement.type === "node" &&
          Number.isFinite(nodeElement.lat) &&
          Number.isFinite(nodeElement.lon),
      )
      .map((nodeElement) => [nodeElement.id, nodeElement]),
  );
  const roadWays = data.elements.filter(
    (wayElement) =>
      wayElement.type === "way" &&
      wayElement.tags?.highway &&
      Array.isArray(wayElement.nodes),
  );
  const originNode = nodes.values().next().value;
  if (!originNode || !roadWays.length)
    throw Error(
      "No road ways and nodes found. Export road data with node coordinates.",
    );
  const points = new Map(),
    segments = [];
  const getPoint = (nodeId) => {
    const nodeElement = nodes.get(nodeId);
    if (!nodeElement)
      throw Error("Some road nodes are missing. Include all way nodes in the export.");
    if (!points.has(nodeId))
      points.set(
        nodeId,
        new Point(
          (nodeElement.lon - originNode.lon) *
            1110000 *
            Math.cos((originNode.lat * Math.PI) / 180),
          (originNode.lat - nodeElement.lat) * 1110000,
        ),
      );
    return points.get(nodeId);
  };
  for (const way of roadWays)
    for (let nodeIndex = 1; nodeIndex < way.nodes.length; nodeIndex++) {
      const startPoint = getPoint(way.nodes[nodeIndex - 1]);
      const endPoint = getPoint(way.nodes[nodeIndex]);
      if (distance(startPoint, endPoint) > 1) {
        const reverse = way.tags.oneway === "-1";
        segments.push(
          new Segment(
            reverse ? endPoint : startPoint,
            reverse ? startPoint : endPoint,
            ["yes", "1", "true", "-1"].includes(way.tags.oneway) ||
              way.tags.junction === "roundabout",
          ),
        );
      }
      if (segments.length > 350)
        throw Error("Select a smaller area: at most 350 road segments.");
    }
  return { graph: { points: [...points.values()], segments } };
}
