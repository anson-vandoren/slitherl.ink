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

    const n1Dir = e1Index;
    const n2Dir = e2Index;

    // Determine direction from N1 to N2 (relative to N1)
    // Formula: (cornerIndex + 1) % 6
    const dirN1toN2 = (cornerIndex + 1) % 6;

    // Determine direction from N2 to N1 (relative to N2)
    // Formula: (cornerIndex + 4) % 6
    const dirN2toN1 = (cornerIndex + 4) % 6;

    if (n1) {
      // If N1 exists, s3 is the edge of N1 towards N2
      s3 = n1.activeEdges[dirN1toN2];
      setS3 = (newState) => {
        this.setEdgeState(n1.q, n1.r, dirN1toN2, newState);
      };
    } else if (n2) {
      // If N1 is missing but N2 exists, s3 is the edge of N2 towards N1
      s3 = n2.activeEdges[dirN2toN1];
      setS3 = (newState) => {
        this.setEdgeState(n2.q, n2.r, dirN2toN1, newState);
      };
    }
    // If neither exists, s3 remains -1, effectively treated as "Calculated Off" below.

    // Logic:
    // If exactly 2 edges are Active (1) -> 3rd (if Neutral 0) becomes Calculated Off (3)
    // If exactly 2 edges are Inactive (2 or 3) -> 3rd (if Neutral 0) becomes Calculated Off (3)

    // Treat boundary edges (phantom edges) as 'Calculated Off' (3)
    let effectiveS3 = s3;
    if (effectiveS3 === -1) {
      effectiveS3 = 3;
    }

    const states = [s1, s2, effectiveS3];
    // Filter not needed anymore as we handle s3=-1 via effectiveS3=3

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

  loadBinaryMap(buffer) {
    this.hexagons.clear();
    const view = new DataView(buffer);
    this.radius = view.getUint8(0);

    let byteIndex = 1;

    // Iterate in the same canonical order
    for (let q = -this.radius; q <= this.radius; q++) {
      const r1 = Math.max(-this.radius, -q - this.radius);
      const r2 = Math.min(this.radius, -q + this.radius);
      for (let r = r1; r <= r2; r++) {
        const byte = view.getUint8(byteIndex);

        // Unpack byte
        // Bit 0: Region (1=Inside, 0=Outside) (Note: original generator code used 1=Inside, 2=Outside,
        // but the binary saves 1 for Inside, 0 for Outside. I should map this back to 1 and 2 for consistency if needed,
        // or just use 1 and 2. The generator saves bit as (active===1 ? 1 : 0).
        // So bit 1 means Inside (state 1), bit 0 means Outside (state 2).
        const regionBit = byte & 0x1;
        const active = regionBit === 1 ? 1 : 2;

        const count = (byte >> 1) & 0x7;
        const show = (byte >> 4) & 0x1;

        const s = -q - r;
        const key = `${q},${r}`;
        this.hexagons.set(key, {
          q,
          r,
          s,
          active,
          targetCount: count,
          showNumber: show === 1,
          activeEdges: [0, 0, 0, 0, 0, 0], // Initialize to Neutral (0)
        });

        byteIndex++;
      }
    }
    // No longer calling deriveEdgesFromRegions(), starting with neutral board.
  }

  deriveEdgesFromRegions() {
    // Deprecated for Puzzle Mode.
    // Kept empty/minimal or just removed.
    // If I leave it, I should make sure it's not called or doesn't do anything disruptive.
    // The previous implementation overwrote activeEdges.
    // I entered this method in the replacement range, so I will effectively remove the old logic.
    // For now, I'll just leave it empty or remove it.
    // The plan said "Remove deriveEdgesFromRegions call on load".
    // I will remove the method entirely if I can cover the whole range.
  }
}
