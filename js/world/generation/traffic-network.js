/* Directed road graph, right-hand lane geometry and junction connectors. */
function pathMetrics(points) {
  const cumulativeLengths = [0];
  for (let pointIndex = 1; pointIndex < points.length; pointIndex++)
    cumulativeLengths.push(
      cumulativeLengths[pointIndex - 1] +
        distance(points[pointIndex - 1], points[pointIndex]),
    );
  return {
    points,
    lengths: cumulativeLengths,
    length: cumulativeLengths[cumulativeLengths.length - 1],
  };
}
function samplePath(path, sampleDistance) {
  sampleDistance = Math.max(0, Math.min(path.length, sampleDistance));
  let lowerIndex = 1,
    upperIndex = path.lengths.length - 1;
  while (lowerIndex < upperIndex) {
    const middleIndex = (lowerIndex + upperIndex) >> 1;
    if (path.lengths[middleIndex] < sampleDistance) lowerIndex = middleIndex + 1;
    else upperIndex = middleIndex;
  }
  const endIndex = Math.max(1, lowerIndex);
  const segmentStart = path.points[endIndex - 1];
  const segmentEnd = path.points[endIndex];
  const segmentLength = path.lengths[endIndex] - path.lengths[endIndex - 1];
  return {
    point: lerp2D(
      segmentStart,
      segmentEnd,
      segmentLength ? (sampleDistance - path.lengths[endIndex - 1]) / segmentLength : 0,
    ),
    direction: normalize(subtract(segmentEnd, segmentStart)),
  };
}
function makeLane(arc, roadWidth) {
  if (arc.lane) return arc.lane;
  const points = arc.reverse ? [...arc.edge.points].reverse() : arc.edge.points;
  const laneOffset = roadWidth / 4;
  const lane = points.map((centerPoint, pointIndex) => {
    const previousDirection = normalize(
      subtract(centerPoint, points[Math.max(0, pointIndex - 1)]),
    );
    const nextDirection = normalize(
      subtract(points[Math.min(points.length - 1, pointIndex + 1)], centerPoint),
    );
    const averagedDirection = normalize(add(previousDirection, nextDirection));
    // Screen y increases downward: the right side is (-dy,+dx).
    const normal = perpendicular(averagedDirection);
    const side = perpendicular(
      pointIndex === points.length - 1 ? previousDirection : nextDirection,
    );
    const miterLength = Math.min(
      laneOffset * 1.8,
      laneOffset / Math.max(0.55, dot(normal, side)),
    );
    return add(centerPoint, scale(normal, miterLength));
  });
  const completePath = pathMetrics(lane);
  const defaultTrim = Math.min(roadWidth * 0.7, completePath.length * 0.18);
  const startTrim =
    arc.startClearance == null
      ? defaultTrim
      : Math.min(arc.startClearance, completePath.length * 0.45);
  const endTrim =
    arc.endClearance == null
      ? defaultTrim
      : Math.min(arc.endClearance, completePath.length * 0.45);
  const laneStart = samplePath(completePath, startTrim).point;
  const laneEnd = samplePath(completePath, completePath.length - endTrim).point;
  const trimmedPoints = [laneStart];
  for (let pointIndex = 1; pointIndex < lane.length - 1; pointIndex++)
    if (
      completePath.lengths[pointIndex] > startTrim &&
      completePath.lengths[pointIndex] < completePath.length - endTrim
    )
      trimmedPoints.push(lane[pointIndex]);
  trimmedPoints.push(laneEnd);
  arc.lane = pathMetrics(trimmedPoints);
  return arc.lane;
}
function connectorPath(fromPath, toPath, roadWidth) {
  const fromSample = samplePath(fromPath, fromPath.length);
  const toSample = samplePath(toPath, 0);
  const reach = Math.min(
    roadWidth * 0.7,
    distance(fromSample.point, toSample.point) * 0.7,
  );
  const firstControlPoint = add(fromSample.point, scale(fromSample.direction, reach));
  const secondControlPoint = subtract(toSample.point, scale(toSample.direction, reach));
  const points = [];
  for (let sampleIndex = 0; sampleIndex <= 12; sampleIndex++) {
    const progress = sampleIndex / 12;
    const remainingProgress = 1 - progress;
    points.push(
      new Point(
        remainingProgress * remainingProgress * remainingProgress * fromSample.point.x +
          3 * remainingProgress * remainingProgress * progress * firstControlPoint.x +
          3 * remainingProgress * progress * progress * secondControlPoint.x +
          progress * progress * progress * toSample.point.x,
        remainingProgress * remainingProgress * remainingProgress * fromSample.point.y +
          3 * remainingProgress * remainingProgress * progress * firstControlPoint.y +
          3 * remainingProgress * progress * progress * secondControlPoint.y +
          progress * progress * progress * toSample.point.y,
      ),
    );
  }
  return pathMetrics(points);
}
function buildTrafficNetwork(world) {
  const arcs = [],
    outgoing = new Map();
  const addRoadEdge = (roadPoints, fromNodeId, toNodeId, oneWay = 0, name = "") => {
    roadPoints = roadPoints.filter(
      (point, pointIndex) =>
        pointIndex === 0 || distance(point, roadPoints[pointIndex - 1]) > 1e-8,
    );
    if (roadPoints.length < 2) return;
    const roadEdge = { points: roadPoints, name };
    const addArc = (isReverse, startNodeId, endNodeId) => {
      const arc = {
        id: arcs.length,
        edge: roadEdge,
        reverse: isReverse,
        from: startNodeId,
        to: endNodeId,
      };
      arcs.push(arc);
      if (!outgoing.has(startNodeId)) outgoing.set(startNodeId, []);
      outgoing.get(startNodeId).push(arc);
    };
    if (oneWay !== -1) addArc(false, fromNodeId, toNodeId);
    if (oneWay !== 1) addArc(true, toNodeId, fromNodeId);
  };
  if (world.kind === "country") {
    const roadConnectionCounts = new Uint16Array(world.data.nodes.length);
    for (const road of world.roads)
      if (road.drivable) for (const nodeId of road.refs) roadConnectionCounts[nodeId]++;
    for (const road of world.roads)
      if (road.drivable) {
        let sectionStart = 0;
        for (let itemIndex = 1; itemIndex < road.refs.length; itemIndex++)
          if (
            itemIndex === road.refs.length - 1 ||
            roadConnectionCounts[road.refs[itemIndex]] > 1
          ) {
            addRoadEdge(
              road.refs
                .slice(sectionStart, itemIndex + 1)
                .map((ref) => new Point(...world.data.nodes[ref])),
              road.refs[sectionStart],
              road.refs[itemIndex],
              road.oneWay,
              road.name,
            );
            sectionStart = itemIndex;
          }
      }
  }
  const localNodeKey = (point) => `local:${point.x},${point.y}`;
  for (const segment of world.graph.segments)
    addRoadEdge(
      [segment.p1, segment.p2],
      localNodeKey(segment.p1),
      localNodeKey(segment.p2),
      segment.oneWay ? 1 : 0,
    );
  return { arcs, outgoing };
}
