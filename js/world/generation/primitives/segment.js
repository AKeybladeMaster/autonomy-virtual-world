class Segment {
  constructor(p1, p2, oneWay = false) {
    this.p1 = p1;
    this.p2 = p2;
    this.oneWay = oneWay;
  }

  length() {
    return distance(this.p1, this.p2);
  }

  directionVector() {
    return normalize(subtract(this.p2, this.p1));
  }

  equals(otherSegment) {
    return this.includes(otherSegment.p1) && this.includes(otherSegment.p2);
  }

  includes(point) {
    return this.p1.equals(point) || this.p2.equals(point);
  }

  distanceToPoint(point) {
    const projection = this.projectPoint(point);
    if (projection.offset > 0 && projection.offset < 1) {
      return distance(point, projection.point);
    }
    const distToP1 = distance(point, this.p1);
    const distToP2 = distance(point, this.p2);
    return Math.min(distToP1, distToP2);
  }

  projectPoint(point) {
    const pointFromStart = subtract(point, this.p1);
    const segmentVector = subtract(this.p2, this.p1);
    const normalizedSegment = normalize(segmentVector);
    const projectedDistance = dot(pointFromStart, normalizedSegment);
    const projection = {
      point: add(this.p1, scale(normalizedSegment, projectedDistance)),
      offset: projectedDistance / magnitude(segmentVector),
    };
    return projection;
  }

  draw(ctx, { width = 2, color = "black", dash = [], cap = "butt" } = {}) {
    ctx.beginPath();
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.lineCap = cap;
    if (this.oneWay) {
      dash = [4, 4];
    }
    ctx.setLineDash(dash);
    ctx.moveTo(this.p1.x, this.p1.y);
    ctx.lineTo(this.p2.x, this.p2.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}
