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
      active: 0,
      activeEdges: [0, 0, 0, 0, 0, 0],
    });
  }

  getHex(q, r) {
    return this.hexagons.get(`${q},${r}`);
  }

  getNeighbor(q, r, direction) {
    const directions = [
      { dq: 1, dr: 0 }, // 0
      { dq: 0, dr: 1 }, // 1
      { dq: -1, dr: 1 }, // 2
      { dq: -1, dr: 0 }, // 3
      { dq: 0, dr: -1 }, // 4
      { dq: 1, dr: -1 }, // 5
    ];
    const d = directions[direction];
    return this.getHex(q + d.dq, r + d.dr);
  }

  getAllHexes() {
    return this.hexagons.values();
  }
}
