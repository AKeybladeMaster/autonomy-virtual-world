/* General bounds index for roads and scenery. */
class SpatialGrid {
  constructor(cellSize) {
    this.size = cellSize;
    this.cells = new Map();
  }
  add(item, minX, minY, maxX = minX, maxY = minY) {
    for (let x = Math.floor(minX / this.size); x <= Math.floor(maxX / this.size); x++)
      for (
        let y = Math.floor(minY / this.size);
        y <= Math.floor(maxY / this.size);
        y++
      ) {
        const key = `${x},${y}`;
        if (!this.cells.has(key)) this.cells.set(key, []);
        this.cells.get(key).push(item);
      }
  }
  query(minX, minY, maxX, maxY) {
    const found = new Set();
    for (let x = Math.floor(minX / this.size); x <= Math.floor(maxX / this.size); x++)
      for (let y = Math.floor(minY / this.size); y <= Math.floor(maxY / this.size); y++)
        for (const item of this.cells.get(`${x},${y}`) || []) found.add(item);
    return [...found];
  }
}

/* Cars occupy one cell each, unlike roads with multi-cell bounds. Numeric row
   keys and a caller-owned result array avoid a Set, string keys and two fresh
   arrays for each vehicle at each physics step. The safety search area is kept. */
class PointSpatialGrid {
  constructor(cellSize) {
    this.size = cellSize;
    this.rows = new Map();
  }
  add(item, x, y) {
    const ix = Math.floor(x / this.size),
      iy = Math.floor(y / this.size);
    let row = this.rows.get(ix);
    if (!row) this.rows.set(ix, (row = new Map()));
    let cell = row.get(iy);
    if (!cell) row.set(iy, (cell = []));
    cell.push(item);
  }
  queryInto(minX, minY, maxX, maxY, result, excluded) {
    result.length = 0;
    const y0 = Math.floor(minY / this.size),
      y1 = Math.floor(maxY / this.size);
    for (let x = Math.floor(minX / this.size); x <= Math.floor(maxX / this.size); x++) {
      const row = this.rows.get(x);
      if (!row) continue;
      for (let y = y0; y <= y1; y++) {
        const cell = row.get(y);
        if (cell) for (const item of cell) if (item !== excluded) result.push(item);
      }
    }
    return result;
  }
}
