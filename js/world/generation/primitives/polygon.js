class Polygon {
  constructor(points) {
    this.points = points;
    this.segments = [];
    for (let itemIndex = 1; itemIndex <= points.length; itemIndex++) {
      this.segments.push(
        new Segment(points[itemIndex - 1], points[itemIndex % points.length]),
      );
    }
  }

  static load(info) {
    return new Polygon(
      info.points.map((pointData) => new Point(pointData.x, pointData.y)),
    );
  }

  static union(polys) {
    Polygon.multiBreak(polys);
    const keptSegments = [];
    for (let itemIndex = 0; itemIndex < polys.length; itemIndex++) {
      for (const segment of polys[itemIndex].segments) {
        let keep = true;
        for (let nextItemIndex = 0; nextItemIndex < polys.length; nextItemIndex++) {
          if (itemIndex !== nextItemIndex) {
            if (polys[nextItemIndex].containsSegment(segment)) {
              keep = false;
              break;
            }
          }
        }
        if (keep) {
          keptSegments.push(segment);
        }
      }
    }
    return keptSegments;
  }

  static multiBreak(polys) {
    for (let itemIndex = 0; itemIndex < polys.length - 1; itemIndex++) {
      for (
        let nextItemIndex = itemIndex + 1;
        nextItemIndex < polys.length;
        nextItemIndex++
      ) {
        Polygon.break(polys[itemIndex], polys[nextItemIndex]);
      }
    }
  }

  static break(firstPolygon, secondPolygon) {
    const firstSegments = firstPolygon.segments;
    const secondSegments = secondPolygon.segments;
    for (let itemIndex = 0; itemIndex < firstSegments.length; itemIndex++) {
      for (
        let nextItemIndex = 0;
        nextItemIndex < secondSegments.length;
        nextItemIndex++
      ) {
        const intersection = getIntersection(
          firstSegments[itemIndex].p1,
          firstSegments[itemIndex].p2,
          secondSegments[nextItemIndex].p1,
          secondSegments[nextItemIndex].p2,
        );

        if (intersection && intersection.offset !== 1 && intersection.offset !== 0) {
          const point = new Point(intersection.x, intersection.y);
          let segmentEnd = firstSegments[itemIndex].p2;
          firstSegments[itemIndex].p2 = point;
          firstSegments.splice(itemIndex + 1, 0, new Segment(point, segmentEnd));
          segmentEnd = secondSegments[nextItemIndex].p2;
          secondSegments[nextItemIndex].p2 = point;
          secondSegments.splice(nextItemIndex + 1, 0, new Segment(point, segmentEnd));
        }
      }
    }
  }

  distanceToPoint(point) {
    return Math.min(...this.segments.map((s) => s.distanceToPoint(point)));
  }

  distanceToPoly(poly) {
    return Math.min(...this.points.map((p) => poly.distanceToPoint(p)));
  }

  intersectsPoly(poly) {
    for (const firstSegment of this.segments) {
      for (const secondSegment of poly.segments) {
        if (
          getIntersection(
            firstSegment.p1,
            firstSegment.p2,
            secondSegment.p1,
            secondSegment.p2,
          )
        ) {
          return true;
        }
      }
    }
    return false;
  }

  containsSegment(segment) {
    const midpoint = average(segment.p1, segment.p2);
    return this.containsPoint(midpoint);
  }

  containsPoint(point) {
    let inside = false;
    for (
      let itemIndex = 0, nextItemIndex = this.points.length - 1;
      itemIndex < this.points.length;
      nextItemIndex = itemIndex++
    ) {
      const currentPoint = this.points[itemIndex];
      const previousPoint = this.points[nextItemIndex];
      if (
        currentPoint.y > point.y !== previousPoint.y > point.y &&
        point.x <
          ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) /
            (previousPoint.y - currentPoint.y) +
            currentPoint.x
      )
        inside = !inside;
    }
    return inside;
  }

  drawSegments(ctx) {
    for (const seg of this.segments) {
      seg.draw(ctx, { color: getRandomColor(), width: 5 });
    }
  }

  draw(
    ctx,
    { stroke = "blue", lineWidth = 2, fill = "rgba(0,0,255,0.3)", join = "miter" } = {},
  ) {
    ctx.beginPath();
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = join;
    ctx.moveTo(this.points[0].x, this.points[0].y);
    for (let itemIndex = 1; itemIndex < this.points.length; itemIndex++) {
      ctx.lineTo(this.points[itemIndex].x, this.points[itemIndex].y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}
