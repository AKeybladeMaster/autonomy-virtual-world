/* Shared rectangular safety footprint; independent of visual car styling. */
function vehiclePolygon(car, centerX = car.x, centerY = car.y, heading = car.angle) {
  const forwardVector = new Point(-Math.sin(heading), -Math.cos(heading));
  const rightVector = perpendicular(forwardVector);
  return [
    [-1, -1],
    [-1, 1],
    [1, 1],
    [1, -1],
  ].map(([longitudinalSign, lateralSign]) =>
    add(
      new Point(centerX, centerY),
      add(
        scale(forwardVector, (longitudinalSign * car.height) / 2),
        scale(rightVector, (lateralSign * car.width) / 2),
      ),
    ),
  );
}
function polygonsOverlap(firstPolygon, secondPolygon) {
  for (const polygon of [firstPolygon, secondPolygon])
    for (let pointIndex = 0; pointIndex < polygon.length; pointIndex++) {
      const axis = perpendicular(
        subtract(polygon[(pointIndex + 1) % polygon.length], polygon[pointIndex]),
      );
      const firstProjection = firstPolygon.map((point) => dot(point, axis));
      const secondProjection = secondPolygon.map((point) => dot(point, axis));
      if (
        Math.max(...firstProjection) < Math.min(...secondProjection) ||
        Math.max(...secondProjection) < Math.min(...firstProjection)
      )
        return false;
    }
  return true;
}
