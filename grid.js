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

  setEdgeState(q, r, edgeIndex, newState) {
    const hex = this.getHex(q, r);
    if (!hex) return;

    if (hex.activeEdges[edgeIndex] === newState) return;

    hex.activeEdges[edgeIndex] = newState;

    // Sync neighbor
    const neighbor = this.getNeighbor(q, r, edgeIndex);
    if (neighbor) {
      const neighborEdgeIndex = (edgeIndex + 3) % 6;
      neighbor.activeEdges[neighborEdgeIndex] = newState;
    }

    // Check vertices at both ends of this edge
    // Edge i connects Corner i and Corner i+1 (mod 6)
    this.checkVertex(hex, edgeIndex);
    this.checkVertex(hex, (edgeIndex + 1) % 6);
  }

  checkVertex(hex, cornerIndex) {
    if (!hex) return;

    // Identify the three edges meeting at this vertex (Corner i)
    // 1. Edge (i-1) of this hex (previous edge)
    const e1Index = (cornerIndex + 5) % 6;
    const s1 = hex.activeEdges[e1Index];

    // 2. Edge i of this hex (current edge/next edge from corner)
    const e2Index = cornerIndex;
    const s2 = hex.activeEdges[e2Index];

    // 3. The edge connecting the two neighbors
    // Neighbors are in direction of e1 and e2
    const n1 = this.getNeighbor(hex.q, hex.r, e1Index);
    const n2 = this.getNeighbor(hex.q, hex.r, e2Index);

    let s3 = -1; // -1 means invalid/boundary
    let setS3 = null; // function to set s3 if needed

    if (n1 && n2) {
      // Find which edge of n1 connects to n2
      // Using coordinate math to find direction from n1 to n2
      const dq = n2.q - n1.q;
      const dr = n2.r - n1.r;

      // Determine direction index based on dq, dr
      // Directions:
      // 0: (1, 0), 1: (0, 1), 2: (-1, 1), 3: (-1, 0), 4: (0, -1), 5: (1, -1)
      let dir = -1;
      if (dq === 1 && dr === 0) dir = 0;
      else if (dq === 0 && dr === 1) dir = 1;
      else if (dq === -1 && dr === 1) dir = 2;
      else if (dq === -1 && dr === 0) dir = 3;
      else if (dq === 0 && dr === -1) dir = 4;
      else if (dq === 1 && dr === -1) dir = 5;

      if (dir !== -1) {
        s3 = n1.activeEdges[dir];
        setS3 = (newState) => {
          this.setEdgeState(n1.q, n1.r, dir, newState);
        };
      }
    }

    // Logic:
    // If exactly 2 edges are Active (1) -> 3rd (if Neutral 0) becomes Calculated Off (3)
    // If exactly 2 edges are Inactive (2 or 3) -> 3rd (if Neutral 0) becomes Calculated Off (3)

    const states = [s1, s2, s3];
    // Filter valid edges (s3 might be -1 if boundary)
    if (s3 === -1) return;

    const activeCount = states.filter((s) => s === 1).length;
    const inactiveCount = states.filter((s) => s === 2 || s === 3).length;
    const neutralCount = states.filter((s) => s === 0).length;

    if (neutralCount === 1) {
      // We have exactly one neutral edge, determining if we should flip it
      let shouldTurnOff = false;
      if (activeCount === 2) shouldTurnOff = true;
      if (inactiveCount === 2) shouldTurnOff = true;

      if (shouldTurnOff) {
        // Find which one is neutral and set it
        if (s1 === 0) this.setEdgeState(hex.q, hex.r, e1Index, 3);
        else if (s2 === 0) this.setEdgeState(hex.q, hex.r, e2Index, 3);
        else if (s3 === 0 && setS3) setS3(3);
      }
    }
  }

  loadMap(mapData) {
    this.hexagons.clear();
    this.radius = mapData.radius;

    // Load hexes with their Region state (1=Inside, 2=Outside)
    for (const h of mapData.hexes) {
      const key = `${h.q},${h.r}`;
      this.hexagons.set(key, {
        q: h.q,
        r: h.r,
        s: -h.q - h.r,
        active: h.active, // This is the Region state
        activeEdges: [0, 0, 0, 0, 0, 0],
      });
    }

    this.deriveEdgesFromRegions();
  }

  deriveEdgesFromRegions() {
    for (const hex of this.hexagons.values()) {
      for (let i = 0; i < 6; i++) {
        const neighbor = this.getNeighbor(hex.q, hex.r, i);
        let edgeState = 2; // Default to Inactive

        if (neighbor) {
          // If regions differ, edge is Active (1)
          if (hex.active !== neighbor.active) {
            edgeState = 1;
          } else {
            edgeState = 2;
          }
        } else {
          // Boundary edge
          // If hex is Inside (1), boundary is Active (1)
          // If hex is Outside (2), boundary is Inactive (2)
          if (hex.active === 1) edgeState = 1;
          else edgeState = 2;
        }

        // Set the state directly to avoid triggering propagation logic during setup
        hex.activeEdges[i] = edgeState;
      }
    }
  }
}
