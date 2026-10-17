class Envelope {
  constructor(skeleton, width, roundness = 1) {
    if (skeleton) {
      this.skeleton = skeleton;
      this.poly = this.#generatePolygon(width, roundness);
    }
  }

  static load(info) {
    const env = new Envelope();
    env.skeleton = new Segment(info.skeleton.p1, info.skeleton.p2);
    env.poly = Polygon.load(info.poly);
    return env;
  }

  #generatePolygon(width, roundness) {
    const { p1, p2 } = this.skeleton;

    const radius = width / 2;
    const alpha = angle(subtract(p1, p2));
    const alpha_cw = alpha + Math.PI / 2;
    const alpha_ccw = alpha - Math.PI / 2;

    const points = [];
    const step = Math.PI / Math.max(1, roundness);
    const eps = step / 2;
    for (let itemIndex = alpha_ccw; itemIndex <= alpha_cw + eps; itemIndex += step) {
      points.push(translate(p1, itemIndex, radius));
    }
    for (let itemIndex = alpha_ccw; itemIndex <= alpha_cw + eps; itemIndex += step) {
      points.push(translate(p2, Math.PI + itemIndex, radius));
    }

    return new Polygon(points);
  }

  draw(ctx, options) {
    this.poly.draw(ctx, options);
  }
}
