import fs from 'fs';

/**
 * Coordinate helpers
 */
function getKey(q, r) {
  return `${q},${r}`;
}

function getNeighbor(q, r, direction) {
  const directions = [
    { dq: 1, dr: 0 },
    { dq: 0, dr: 1 },
    { dq: -1, dr: 1 },
    { dq: -1, dr: 0 },
    { dq: 0, dr: -1 },
    { dq: 1, dr: -1 },
  ];
  const d = directions[direction];
  return { q: q + d.dq, r: r + d.dr };
}

function getNeighbors(q, r) {
  const neighbors = [];
  for (let i = 0; i < 6; i++) {
    neighbors.push(getNeighbor(q, r, i));
  }
  return neighbors;
}

/**
 * Main Generator
 */
function generateMap(radius) {
  const hexes = new Map();

  // Initialize all hexes in the grid as "Outside" (state 2)
  for (let q = -radius; q <= radius; q++) {
    const r1 = Math.max(-radius, -q - radius);
    const r2 = Math.min(radius, -q + radius);
    for (let r = r1; r <= r2; r++) {
      hexes.set(getKey(q, r), { q, r, active: 2 });
    }
  }

  // Pick a random center start for "Inside" (state 1)
  const insideSet = new Set();
  const startQ = 0;
  const startR = 0;

  insideSet.add(getKey(startQ, startR));
  hexes.get(getKey(startQ, startR)).active = 1;

  let candidates = getNeighbors(startQ, startR)
    .filter((n) => hexes.has(getKey(n.q, n.r)))
    .map((n) => getKey(n.q, n.r));

  const targetSize = Math.floor(hexes.size * 0.45);

  while (insideSet.size < targetSize && candidates.length > 0) {
    const scoredCandidates = candidates.map((key) => {
      const parts = key.split(',').map(Number);
      const q = parts[0];
      const r = parts[1];
      const neighbors = getNeighbors(q, r);
      let insideNeighborCount = 0;
      for (const n of neighbors) {
        if (insideSet.has(getKey(n.q, n.r))) {
          insideNeighborCount++;
        }
      }
      return { key, score: insideNeighborCount };
    });

    let minScore = 6;
    for (const item of scoredCandidates) {
      if (item.score < minScore) minScore = item.score;
    }

    const bestCandidates = scoredCandidates.filter((item) => item.score === minScore);
    const randIndex = Math.floor(Math.random() * bestCandidates.length);
    const candidateKey = bestCandidates[randIndex].key;

    const candidateIndex = candidates.indexOf(candidateKey);
    candidates.splice(candidateIndex, 1);

    if (insideSet.has(candidateKey)) continue;

    const hex = hexes.get(candidateKey);

    if (canToggle(hex, hexes, radius)) {
      hex.active = 1;
      insideSet.add(candidateKey);

      const neighbors = getNeighbors(hex.q, hex.r);
      for (const n of neighbors) {
        const k = getKey(n.q, n.r);
        if (hexes.has(k) && !insideSet.has(k) && !candidates.includes(k)) {
          candidates.push(k);
        }
      }
    }
  }

  // Post-processing
  let changed = true;
  while (changed) {
    changed = false;
    const candidatesToExtend = [];

    for (const h of hexes.values()) {
      if (h.active === 2) {
        const neighbors = getNeighbors(h.q, h.r);
        let insideCount = 0;
        for (const n of neighbors) {
          if (insideSet.has(getKey(n.q, n.r))) {
            insideCount++;
          }
        }
        if (insideCount === 1) {
          candidatesToExtend.push(h);
        }
      }
    }

    for (const hex of candidatesToExtend) {
      const neighbors = getNeighbors(hex.q, hex.r);
      let insideCount = 0;
      for (const n of neighbors) {
        if (insideSet.has(getKey(n.q, n.r))) {
          insideCount++;
        }
      }

      if (insideCount === 1) {
        if (canToggle(hex, hexes, radius)) {
          hex.active = 1;
          insideSet.add(getKey(hex.q, hex.r));
          changed = true;
        }
      }
    }
  }

  // Calculate target counts
  for (const h of hexes.values()) {
    h.targetCount = 0;
    h.showNumber = true;

    const neighbors = getNeighbors(h.q, h.r);
    for (const n of neighbors) {
      const nKey = getKey(n.q, n.r);
      const neighborHex = hexes.get(nKey);
      let neighborActive = 2;
      if (neighborHex) {
        neighborActive = neighborHex.active;
      }
      if (h.active !== neighborActive) {
        h.targetCount++;
      }
    }
  }

  return {
    radius,
    hexes: Array.from(hexes.values()),
  };
}

/**
 * Checks if toggling a hex to Inside preserves connectivity
 */
function canToggle(targetHex, allHexes, radius) {
  const key = getKey(targetHex.q, targetHex.r);
  targetHex.active = 1;

  let totalOutside = 0;
  for (const h of allHexes.values()) {
    if (h.active === 2) totalOutside++;
  }

  const visited = new Set();
  const queue = [];

  for (const h of allHexes.values()) {
    if (h.active === 2) {
      const dist = Math.max(Math.abs(h.q), Math.abs(h.r), Math.abs(-h.q - h.r));
      if (dist === radius) {
        queue.push(h);
        visited.add(getKey(h.q, h.r));
      }
    }
  }

  let reachedCount = 0;
  while (queue.length > 0) {
    const current = queue.pop();
    reachedCount++;

    const neighbors = getNeighbors(current.q, current.r);
    for (const n of neighbors) {
      const nk = getKey(n.q, n.r);
      const neighborHex = allHexes.get(nk);
      if (neighborHex && neighborHex.active === 2 && !visited.has(nk)) {
        visited.add(nk);
        queue.push(neighborHex);
      }
    }
  }

  targetHex.active = 2;
  return reachedCount === totalOutside;
}

/**
 * LOGICAL SOLVER
 */
class Solver {
  constructor(radius, hexes) {
    this.radius = radius;
    this.hexes = new Map(); // key -> {q, r, targetCount, showNumber, active}
    this.edgeStates = new Map(); // key -> 'ACTIVE', 'OFF', 'UNKNOWN'

    // Copy hex data
    for (const h of hexes) {
      this.hexes.set(getKey(h.q, h.r), {
        ...h,
        // Reset state for internal solution tracking?
        // No, we need solution to verify correctness, but 'edgeStates' starts UNKNOWN.
      });
    }

    // Build unique edge keys set
    this.allEdges = new Set();
    for (const h of hexes) {
      for (let dir = 0; dir < 6; dir++) {
        const k = this.getCanonicalEdgeKey(h.q, h.r, dir);
        this.allEdges.add(k);
        this.edgeStates.set(k, 'UNKNOWN');
      }
    }
  }

  getCanonicalEdgeKey(q, r, dir) {
    const d = this.getDirectionVector(dir);
    const nq = q + d.dq;
    const nr = r + d.dr;
    const ndir = (dir + 3) % 6;

    const k1 = `${q},${r},${dir}`;
    const k2 = `${nq},${nr},${ndir}`;
    return k1 < k2 ? k1 : k2;
  }

  getDirectionVector(direction) {
    const directions = [
      { dq: 1, dr: 0 },
      { dq: 0, dr: 1 },
      { dq: -1, dr: 1 },
      { dq: -1, dr: 0 },
      { dq: 0, dr: -1 },
      { dq: 1, dr: -1 },
    ];
    return directions[direction];
  }

  // Returns true if solved uniquely (all edges determined)
  // Returns false if ambiguous or stuck
  solve() {
    let changed = true;
    while (changed) {
      changed = false;

      // 1. Apply Vertex Logic (Continuity)
      // Iterate vertices.
      // Vertices are shared. Iterate hexes, check all 6 vertices.
      for (const h of this.hexes.values()) {
        for (let i = 0; i < 6; i++) {
          if (this.applyVertexLogic(h.q, h.r, i)) changed = true;
        }
      }

      // 2. Apply Hex Logic (Clues)
      for (const h of this.hexes.values()) {
        if (h.showNumber) {
          if (this.applyHexLogic(h)) changed = true;
        }
      }
    }

    // Check if fully determined
    for (const state of this.edgeStates.values()) {
      if (state === 'UNKNOWN') return false;
    }
    return true;
  }

  getEdgeState(q, r, dir) {
    const key = this.getCanonicalEdgeKey(q, r, dir);
    return this.edgeStates.get(key) || 'OFF'; // Default OFF if out of map?
    // Wait, map boundary edges exist.
    // If key not in map -> it's a boundary edge?
    // Our map logic generates edge keys for all internal edges.
    // Boundary edges...
    // In grid.ts, boundary edges are valid.
    // Here we initialized allEdges for all hexes.

    // If it's not in this.edgeStates, it might be an edge on the outer boundary of the grid.
    // But we iterated all hexes and all 6 dirs, so ALL edges touching any hex are in edgeStates.
    // So get should return UNKNOWN.

    return this.edgeStates.get(key) || 'UNKNOWN';
  }

  setEdgeState(q, r, dir, state) {
    const key = this.getCanonicalEdgeKey(q, r, dir);
    const current = this.edgeStates.get(key);
    if (current !== state && current !== 'UNKNOWN') {
      // Contradiction! (Should not happen in a valid puzzle unless logic is flawed or puzzle invalid)
      // For generation check, if we hit contradiction, it means something is wrong, but let's ignore for now.
      return false;
    }
    if (current === 'UNKNOWN') {
      this.edgeStates.set(key, state);
      return true;
    }
    return false;
  }

  applyVertexLogic(q, r, cornerIndex) {
    // A vertex has 3 incident edges.
    // 1. (q, r, cornerIndex) - let's call it "Right" edge (e2 in grid.ts logic)
    // 2. (q, r, (cornerIndex + 5)%6) - "Left" edge (e1)
    // 3. Sticking out edge.

    const e1Dir = (cornerIndex + 5) % 6;
    const e2Dir = cornerIndex;

    // Find neighbors to identify 3rd edge
    // Neighbor at e1Dir
    const n1 = getNeighbor(q, r, e1Dir);
    // Neighbor at e2Dir
    const n2 = getNeighbor(q, r, e2Dir);

    // Only verify if neighbors exist in our map
    const hasN1 = this.hexes.has(getKey(n1.q, n1.r));
    const hasN2 = this.hexes.has(getKey(n2.q, n2.r));

    // If boundary vertex (degree 2), handled separately?
    // Grid.ts logic handles boundary by having 2 edges.

    // Let's get the keys
    const k1 = this.getCanonicalEdgeKey(q, r, e1Dir);
    const k2 = this.getCanonicalEdgeKey(q, r, e2Dir);
    let k3 = null;

    if (hasN1) {
      // From grid.ts: ((cornerIndex + 1) % 6) of neighbor 1
      const d = (cornerIndex + 1) % 6;
      k3 = this.getCanonicalEdgeKey(n1.q, n1.r, d);
    } else if (hasN2) {
      // From grid.ts: ((cornerIndex + 4) % 6) of neighbor 2
      const d = (cornerIndex + 4) % 6;
      k3 = this.getCanonicalEdgeKey(n2.q, n2.r, d);
    }

    const s1 = this.edgeStates.get(k1);
    const s2 = this.edgeStates.get(k2);
    const s3 = k3 ? this.edgeStates.get(k3) : 'OFF'; // Virtual edge is OFF

    let changed = false;

    // Rule: Activity count at vertex must be 0 or 2. (Even)
    // Actually for Loop, it must be exactly 0 or 2.

    const states = [s1, s2, s3];
    const activeCount = states.filter((s) => s === 'ACTIVE').length;
    const unknownCount = states.filter((s) => s === 'UNKNOWN').length;

    // If 2 ACTIVE, rest must be OFF
    if (activeCount === 2) {
      if (s1 === 'UNKNOWN') {
        this.edgeStates.set(k1, 'OFF');
        changed = true;
      }
      if (s2 === 'UNKNOWN') {
        this.edgeStates.set(k2, 'OFF');
        changed = true;
      }
      if (s3 === 'UNKNOWN' && k3) {
        this.edgeStates.set(k3, 'OFF');
        changed = true;
      }
    }
    // If 1 ACTIVE and 0 UNKNOWN -> Contradiction (handled naturally)

    // If 1 ACTIVE and 1 UNKNOWN -> Must be ACTIVE
    else if (activeCount === 1 && unknownCount === 1) {
      if (s1 === 'UNKNOWN') {
        this.edgeStates.set(k1, 'ACTIVE');
        changed = true;
      }
      if (s2 === 'UNKNOWN') {
        this.edgeStates.set(k2, 'ACTIVE');
        changed = true;
      }
      if (s3 === 'UNKNOWN' && k3) {
        this.edgeStates.set(k3, 'ACTIVE');
        changed = true;
      }
    }

    // If 0 ACTIVE and 1 UNKNOWN -> Must be OFF (cannot be 1 alone)
    else if (activeCount === 0 && unknownCount === 1) {
      // Wait, if 0 Active, it could be 0 active total.
      // So 1 UNKNOWN remaining means it COULD be active? NO.
      // If it becomes active, total active is 1. Invalid.
      // So it MUST be OFF.
      if (s1 === 'UNKNOWN') {
        this.edgeStates.set(k1, 'OFF');
        changed = true;
      }
      if (s2 === 'UNKNOWN') {
        this.edgeStates.set(k2, 'OFF');
        changed = true;
      }
      if (s3 === 'UNKNOWN' && k3) {
        this.edgeStates.set(k3, 'OFF');
        changed = true;
      }
    }

    return changed;
  }

  applyHexLogic(hex) {
    const target = hex.targetCount;
    let active = 0;
    let unknown = 0;
    const unknownDirs = [];

    for (let dir = 0; dir < 6; dir++) {
      const s = this.getEdgeState(hex.q, hex.r, dir);
      if (s === 'ACTIVE') active++;
      if (s === 'UNKNOWN') {
        unknown++;
        unknownDirs.push(dir);
      }
    }

    let changed = false;

    // 1. If active == target, rest are OFF
    if (active === target && unknown > 0) {
      for (const dir of unknownDirs) {
        if (this.setEdgeState(hex.q, hex.r, dir, 'OFF')) changed = true;
      }
    }

    // 2. If active + unknown == target, rest are ACTIVE
    if (active + unknown === target && unknown > 0) {
      for (const dir of unknownDirs) {
        if (this.setEdgeState(hex.q, hex.r, dir, 'ACTIVE')) changed = true;
      }
    }

    return changed;
  }
}

/**
 * Difficulty Processor
 */
function processDifficulty(mapData, difficulty) {
  const { radius, hexes } = mapData;
  const hexList = [...hexes]; // copy

  // Shuffle hex list to randomize hint removal
  for (let i = hexList.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [hexList[i], hexList[j]] = [hexList[j], hexList[i]];
  }

  let visibleCount = hexList.length;
  const minDensity = difficulty === 'hard' ? 0 : difficulty === 'medium' ? 0.5 : 0.7;
  const minCount = Math.floor(hexList.length * minDensity);

  for (const hex of hexList) {
    // If we reached min count, stop for medium/easy
    // Hard goes as far as possible
    if (visibleCount <= minCount && difficulty !== 'hard') break;

    // Try hiding this hint
    hex.showNumber = false;
    visibleCount--;

    // Solve
    const solver = new Solver(radius, hexes);
    const solved = solver.solve();

    if (!solved) {
      // Ambiguous or failed, put it back
      hex.showNumber = true;
      visibleCount++;
    }
  }

  return mapData;
}

// Run
const SIZES = {
  small: 2,
  medium: 4,
  large: 7,
  huge: 10,
};

const DIFFICULTIES = ['easy', 'medium', 'hard'];
const MAPS_PER_SIZE = 50; // Reduce count slightly as solving is expensive

for (const [sizeName, radius] of Object.entries(SIZES)) {
  for (const diff of DIFFICULTIES) {
    console.log(`Generating maps for ${sizeName} (radius ${radius}) - ${diff}...`);
    const dirPath = `maps/${sizeName}/${diff}`;

    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    // Reuse base maps? No, generate fresh ones for variety.
    for (let i = 0; i < MAPS_PER_SIZE; i++) {
      // Retry loop if map generation fails or trivial
      let mapData = generateMap(radius);
      processDifficulty(mapData, diff);

      const filename = `${dirPath}/${i}.bin`;
      saveBinaryMap(mapData, filename);
      if (i % 10 === 0) process.stdout.write('.');
    }
    console.log(' Done.');
  }
}

/**
 * Saves map data to a compact binary format.
 */
function saveBinaryMap(mapData, filename) {
  const radius = mapData.radius;
  const hexes = mapData.hexes;

  // Re-create the Map for easy lookup by q,r
  const hexMap = new Map();
  for (const h of hexes) {
    hexMap.set(getKey(h.q, h.r), h);
  }

  // Calculate buffer size
  let totalHexes = 0;
  for (let q = -radius; q <= radius; q++) {
    const r1 = Math.max(-radius, -q - radius);
    const r2 = Math.min(radius, -q + radius);
    totalHexes += r2 - r1 + 1;
  }

  const bufferSize = 1 + totalHexes;
  const buffer = Buffer.alloc(bufferSize);

  buffer.writeUInt8(radius, 0);

  let byteIndex = 1;

  for (let q = -radius; q <= radius; q++) {
    const r1 = Math.max(-radius, -q - radius);
    const r2 = Math.min(radius, -q + radius);
    for (let r = r1; r <= r2; r++) {
      const key = getKey(q, r);
      const hex = hexMap.get(key);

      let regionBit = 0;
      let count = 0;
      let showNumber = 1;

      if (hex) {
        regionBit = hex.active === 1 ? 1 : 0;
        count = hex.targetCount || 0;
        showNumber = hex.showNumber ? 1 : 0;
      }

      let packedByte = 0;
      packedByte |= regionBit & 0x1;
      packedByte |= (count & 0x7) << 1;
      packedByte |= (showNumber & 0x1) << 4;

      buffer.writeUInt8(packedByte, byteIndex);
      byteIndex++;
    }
  }

  fs.writeFileSync(filename, buffer);
}
