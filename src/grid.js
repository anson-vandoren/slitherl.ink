export class Grid {
  constructor(radius) {
    this.radius = radius;
    this.hexagons = new Map();
    this.generateGrid();
  }

  generateGrid() {
    for (let q = -this.radius; q <= this.radius; q++) {
      const r1 = Math.max(-this.radius, -q - this.radius);
      const r2 = Math.min(this.radius, -q + this.radius);
      for (let r = r1; r <= r2; r++) {
        const s = -q - r;
        this.addHex(q, r, s);
      }
    }
  }

  addHex(q, r, s) {
    const key = `${q},${r}`;
    this.hexagons.set(key, {
      q,
      r,
      s,
      active: false,
      activeEdges: [false, false, false, false, false, false],
    });
  }

  getHex(q, r) {
    return this.hexagons.get(`${q},${r}`);
  }

  getAllHexes() {
    return this.hexagons.values();
  }
}
