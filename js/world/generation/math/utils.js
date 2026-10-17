function getNearestPoint(location, points, threshold = Number.MAX_SAFE_INTEGER) {
  let minimumDistance = Number.MAX_SAFE_INTEGER;
  let nearestPoint = null;
  for (const point of points) {
    const pointDistance = distance(point, location);
    if (pointDistance < minimumDistance && pointDistance < threshold) {
      minimumDistance = pointDistance;
      nearestPoint = point;
    }
  }
  return nearestPoint;
}

function getNearestSegment(location, segments, threshold = Number.MAX_SAFE_INTEGER) {
  let minimumDistance = Number.MAX_SAFE_INTEGER;
  let nearestSegment = null;
  for (const segment of segments) {
    const segmentDistance = segment.distanceToPoint(location);
    if (segmentDistance < minimumDistance && segmentDistance < threshold) {
      minimumDistance = segmentDistance;
      nearestSegment = segment;
    }
  }
  return nearestSegment;
}

function distance(p1, p2) {
  return Math.hypot(p1.x - p2.x, p1.y - p2.y);
}

function average(p1, p2) {
  return new Point((p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
}

function dot(p1, p2) {
  return p1.x * p2.x + p1.y * p2.y;
}

function add(p1, p2) {
  return new Point(p1.x + p2.x, p1.y + p2.y);
}

function subtract(p1, p2) {
  return new Point(p1.x - p2.x, p1.y - p2.y);
}

function scale(p, scaler) {
  return new Point(p.x * scaler, p.y * scaler);
}

function normalize(p) {
  const length = magnitude(p);
  return length ? scale(p, 1 / length) : new Point(0, 0);
}

function magnitude(p) {
  return Math.hypot(p.x, p.y);
}

function perpendicular(p) {
  return new Point(-p.y, p.x);
}

function translate(loc, angle, offset) {
  return new Point(loc.x + Math.cos(angle) * offset, loc.y + Math.sin(angle) * offset);
}

function angle(p) {
  return Math.atan2(p.y, p.x);
}

function getIntersection(firstStart, firstEnd, secondStart, secondEnd) {
  const firstProgressNumerator =
    (secondEnd.x - secondStart.x) * (firstStart.y - secondStart.y) -
    (secondEnd.y - secondStart.y) * (firstStart.x - secondStart.x);
  const secondProgressNumerator =
    (secondStart.y - firstStart.y) * (firstStart.x - firstEnd.x) -
    (secondStart.x - firstStart.x) * (firstStart.y - firstEnd.y);
  const denominator =
    (secondEnd.y - secondStart.y) * (firstEnd.x - firstStart.x) -
    (secondEnd.x - secondStart.x) * (firstEnd.y - firstStart.y);

  const epsilon = 1e-10;
  if (Math.abs(denominator) > epsilon) {
    const firstProgress = firstProgressNumerator / denominator;
    const secondProgress = secondProgressNumerator / denominator;
    if (
      firstProgress >= 0 &&
      firstProgress <= 1 &&
      secondProgress >= 0 &&
      secondProgress <= 1
    ) {
      return {
        x: lerp(firstStart.x, firstEnd.x, firstProgress),
        y: lerp(firstStart.y, firstEnd.y, firstProgress),
        offset: firstProgress,
      };
    }
  }

  return null;
}

function lerp(startValue, endValue, progress) {
  return startValue + (endValue - startValue) * progress;
}

function lerp2D(startPoint, endPoint, progress) {
  return new Point(
    lerp(startPoint.x, endPoint.x, progress),
    lerp(startPoint.y, endPoint.y, progress),
  );
}

function invLerp(startValue, endValue, value) {
  return (value - startValue) / (endValue - startValue);
}

function degToRad(degree) {
  return (degree * Math.PI) / 180;
}

function getRandomColor() {
  const hue = 290 + Math.random() * 260;
  return "hsl(" + hue + ", 100%, 60%)";
}

function getFake3dPoint(point, viewPoint, height) {
  const dir = normalize(subtract(point, viewPoint));
  const dist = distance(point, viewPoint);
  const scaler = Math.atan(dist / 300) / (Math.PI / 2);
  return add(point, scale(dir, height * scaler));
}

function polysIntersect(firstPolygon, secondPolygon) {
  return firstPolygon.some((firstPoint, pointIndex) =>
    secondPolygon.some((secondPoint, nextPointIndex) =>
      getIntersection(
        firstPoint,
        firstPolygon[(pointIndex + 1) % firstPolygon.length],
        secondPoint,
        secondPolygon[(nextPointIndex + 1) % secondPolygon.length],
      ),
    ),
  );
}
