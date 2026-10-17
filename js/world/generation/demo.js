/* Small editable demo road graph, independent of persistence. */
function createDemoGraph() {
  const points = [],
    segments = [];
  const nodeAt = (worldX, worldY) => {
    let existingPoint = points.find(
      (candidatePoint) =>
        Math.abs(candidatePoint.x - worldX) < 0.01 &&
        Math.abs(candidatePoint.y - worldY) < 0.01,
    );
    if (!existingPoint) {
      existingPoint = new Point(worldX, worldY);
      points.push(existingPoint);
    }
    return existingPoint;
  };
  const connect = (startPoint, endPoint) =>
    segments.push(new Segment(startPoint, endPoint));
  const ring = [];
  for (const [centerX, centerY, startAngleDegrees] of [
    [570, -330, -90],
    [570, 330, 0],
    [-570, 330, 90],
    [-570, -330, 180],
  ]) {
    for (let cornerIndex = 0; cornerIndex <= 4; cornerIndex++) {
      const angleRadians = ((startAngleDegrees + cornerIndex * 22.5) * Math.PI) / 180;
      ring.push(
        nodeAt(
          centerX + Math.cos(angleRadians) * 190,
          centerY + Math.sin(angleRadians) * 190,
        ),
      );
    }
  }
  for (let pointIndex = 0; pointIndex < ring.length; pointIndex++) {
    const startPoint = ring[pointIndex],
      endPoint = ring[(pointIndex + 1) % ring.length];
    if (distance(startPoint, endPoint) > 500) {
      const midpoint = nodeAt(
        (startPoint.x + endPoint.x) / 2,
        (startPoint.y + endPoint.y) / 2,
      );
      connect(startPoint, midpoint);
      connect(midpoint, endPoint);
    } else connect(startPoint, endPoint);
  }
  const worldCenter = nodeAt(0, 0);
  for (const [worldX, worldY] of [
    [0, -520],
    [760, 0],
    [0, 520],
    [-760, 0],
  ])
    connect(nodeAt(worldX, worldY), worldCenter);
  return new Graph(points, segments);
}
