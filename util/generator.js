import fs from 'fs';
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import os from 'os';
import { fileURLToPath } from 'url';

// Packing constants
const OFFSET = 64; // Supports radius up to ~30
const STRIDE = 128; // Power of 2 for fast bit shifting

function pack(q, r) {
  return q + OFFSET + ((r + OFFSET) << 7);
}

function unpack(id) {
  const r = (id >> 7) - OFFSET;
  const q = (id & 0x7f) - OFFSET;
  return { q, r };
}

function packEdge(q, r, dir) {
  // pack hex ID, then shift for dir (3 bits)
  const hexId = q + OFFSET + ((r + OFFSET) << 7);
  return (hexId << 3) | dir;
}

/**
 * Coordinate helpers (String based for generator)
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
 * LOGICAL SOLVER (Optimized)
 */
class Solver {
  constructor(radius) {
    this.radius = radius;
    // Map bounds are roughly -radius to +radius.
    // Max ID with OFFSET=64 is roughly (128*128) = 16384.
    // Edge ID is << 3 => 131072.
    this.edgeStates = new Uint8Array(200000); // 0: UNKNOWN, 1: ACTIVE, 2: OFF
    this.dirtyVertices = new Int32Array(5000); // Ring buffer for dirty vertices? A stack/queue is better.
    this.dirtyHexes = new Int32Array(5000);
    this.qHead = 0;
    this.qTail = 0;

    // Hex info
    // We need to know targetCount and showNumber for hexes.
    // Store in TypedArrays for fast access?
    this.hexTargetCounts = new Int8Array(16384).fill(-1);
    this.hexShowNumbers = new Uint8Array(16384);

    // We need a list of active hex IDs map traversal
    this.activeHexIds = new Int32Array(5000); // Sufficient for radius 10 (~331 hexes)
    this.activeHexCount = 0;
    this.hexExists = new Uint8Array(200000);
  }

  reset(hexes) {
    // Clear states
    this.edgeStates.fill(0);
    this.hexTargetCounts.fill(-1);
    this.hexShowNumbers.fill(0);
    this.hexExists.fill(0);
    this.activeHexCount = 0;

    // Load hexes
    for (const h of hexes) {
      const id = pack(h.q, h.r);
      this.hexTargetCounts[id] = h.targetCount !== undefined ? h.targetCount : -1;
      this.hexShowNumbers[id] = h.showNumber ? 1 : 0;
      this.hexExists[id] = 1;
      this.activeHexIds[this.activeHexCount++] = id;
    }
  }

  // Canonical edge key for internal logic
  getCanonicalEdgeId(q, r, dir) {
    const d = this.getDirectionVector(dir);
    const nq = q + d.dq;
    const nr = r + d.dr;
    const ndir = (dir + 3) % 6;

    const id1 = packEdge(q, r, dir);
    const id2 = packEdge(nq, nr, ndir);
    return id1 < id2 ? id1 : id2;
  }

  getDirectionVector(direction) {
    // Static lookup
    switch (direction) {
      case 0:
        return { dq: 1, dr: 0 };
      case 1:
        return { dq: 0, dr: 1 };
      case 2:
        return { dq: -1, dr: 1 };
      case 3:
        return { dq: -1, dr: 0 };
      case 4:
        return { dq: 0, dr: -1 };
      case 5:
        return { dq: 1, dr: -1 };
    }
    return { dq: 0, dr: 0 };
  }

  solve() {
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < this.activeHexCount; i++) {
        const id = this.activeHexIds[i];
        const { q, r } = unpack(id);

        for (let dir = 0; dir < 6; dir++) {
          if (this.applyVertexLogic(q, r, dir)) changed = true;
        }

        if (this.hexShowNumbers[id]) {
          if (this.applyHexLogic(q, r, id)) changed = true;
        }
      }
    }

    for (let i = 0; i < this.activeHexCount; i++) {
      const id = this.activeHexIds[i];
      const { q, r } = unpack(id);
      for (let dir = 0; dir < 6; dir++) {
        const eid = this.getCanonicalEdgeId(q, r, dir);
        if (this.edgeStates[eid] === 0) return false;
      }
    }
    return true;
  }

  setEdgeState(edgeId, state) {
    const current = this.edgeStates[edgeId];
    if (current !== state && current !== 0) {
      // Contradiction
      return false;
    }
    if (current === 0) {
      this.edgeStates[edgeId] = state;
      return true;
    }
    return false;
  }

  applyVertexLogic(q, r, cornerIndex) {
    const e1Dir = (cornerIndex + 5) % 6;
    const e2Dir = cornerIndex;

    // Neighbors
    // Helper to get neighbor coords directly
    // q, r + dir vector
    const d1q = [1, 0, -1, -1, 0, 1][e1Dir];
    const d1r = [0, 1, 1, 0, -1, -1][e1Dir];
    const n1q = q + d1q;
    const n1r = r + d1r;

    const d2q = [1, 0, -1, -1, 0, 1][e2Dir];
    const d2r = [0, 1, 1, 0, -1, -1][e2Dir];
    const n2q = q + d2q;
    const n2r = r + d2r;

    const k1 = this.getCanonicalEdgeId(q, r, e1Dir);
    const k2 = this.getCanonicalEdgeId(q, r, e2Dir);

    let k3 = 0;

    // Check neighbors existence
    const n1Id = pack(n1q, n1r);
    const n2Id = pack(n2q, n2r);

    if (this.hexExists[n1Id]) {
      const d = (cornerIndex + 1) % 6;
      k3 = this.getCanonicalEdgeId(n1q, n1r, d);
    } else if (this.hexExists[n2Id]) {
      const d = (cornerIndex + 4) % 6;
      k3 = this.getCanonicalEdgeId(n2q, n2r, d);
    }

    const s1 = this.edgeStates[k1];
    const s2 = this.edgeStates[k2];
    const s3 = k3 ? this.edgeStates[k3] : 2;

    let changed = false;
    let activeCount = 0;
    let unknownCount = 0;

    if (s1 === 1) activeCount++;
    else if (s1 === 0) unknownCount++;
    if (s2 === 1) activeCount++;
    else if (s2 === 0) unknownCount++;
    if (s3 === 1) activeCount++;
    else if (s3 === 0) unknownCount++; // s3=2 if k3=0

    if (activeCount === 2) {
      if (s1 === 0) {
        this.edgeStates[k1] = 2;
        changed = true;
      }
      if (s2 === 0) {
        this.edgeStates[k2] = 2;
        changed = true;
      }
      if (s3 === 0 && k3) {
        this.edgeStates[k3] = 2;
        changed = true;
      }
    } else if (activeCount === 1 && unknownCount === 1) {
      if (s1 === 0) {
        this.edgeStates[k1] = 1;
        changed = true;
      }
      if (s2 === 0) {
        this.edgeStates[k2] = 1;
        changed = true;
      }
      if (s3 === 0 && k3) {
        this.edgeStates[k3] = 1;
        changed = true;
      }
    } else if (activeCount === 0 && unknownCount === 1) {
      if (s1 === 0) {
        this.edgeStates[k1] = 2;
        changed = true;
      }
      if (s2 === 0) {
        this.edgeStates[k2] = 2;
        changed = true;
      }
      if (s3 === 0 && k3) {
        this.edgeStates[k3] = 2;
        changed = true;
      }
    }
    return changed;
  }

  applyHexLogic(q, r, id) {
    const target = this.hexTargetCounts[id];
    if (target < 0) return false; // Should only call if showNumber is true, but safe check

    let active = 0;
    let unknown = 0;
    // Array to store unknown dirs to avoid alloc?
    // Just iterate twice or store in local vars
    // 6 dirs is small.

    // First pass: counts
    for (let dir = 0; dir < 6; dir++) {
      const eid = this.getCanonicalEdgeId(q, r, dir);
      const s = this.edgeStates[eid];
      if (s === 1) active++;
      else if (s === 0) unknown++;
    }

    let changed = false;

    if (active === target && unknown > 0) {
      // Set all unknown to OFF
      for (let dir = 0; dir < 6; dir++) {
        const eid = this.getCanonicalEdgeId(q, r, dir);
        if (this.edgeStates[eid] === 0) {
          this.edgeStates[eid] = 2;
          changed = true;
        }
      }
    } else if (active + unknown === target && unknown > 0) {
      // Set all unknown to ACTIVE
      for (let dir = 0; dir < 6; dir++) {
        const eid = this.getCanonicalEdgeId(q, r, dir);
        if (this.edgeStates[eid] === 0) {
          this.edgeStates[eid] = 1;
          changed = true;
        }
      }
    }
    return changed;
  }
}

// Monkey patch reset to include hexExists
Solver.prototype.initHexExists = function () {
  this.hexExists = new Uint8Array(16384);
};
// Add to constructor in real code, but here we can just update the class definition above.
// Since I can't edit the class definition recursively easily, I'll rely on the replacement text being complete.
// I will include hexExists in the replacement above.
// Re-writing the class block in the replacement string to be correct.

class OptimizedSolver {
  constructor(radius) {
    this.radius = radius;
    this.edgeStates = new Uint8Array(200000);
    this.hexTargetCounts = new Int8Array(16384);
    this.hexShowNumbers = new Uint8Array(16384);
    this.hexExists = new Uint8Array(16384);
    this.activeHexIds = [];
  }

  reset(hexes) {
    this.edgeStates.fill(0);
    this.hexTargetCounts.fill(-1);
    this.hexExists.fill(0);
    this.hexShowNumbers.fill(0);
    this.activeHexIds.length = 0;

    for (const h of hexes) {
      const id = pack(h.q, h.r);
      this.hexTargetCounts[id] = h.targetCount !== undefined ? h.targetCount : -1;
      this.hexShowNumbers[id] = h.showNumber ? 1 : 0;
      this.hexExists[id] = 1;
      this.activeHexIds.push(id);
    }
  }

  getCanonicalEdgeId(q, r, dir) {
    // ... same as above
    const d = this.getDirectionVector(dir);
    const nq = q + d.dq;
    const nr = r + d.dr;
    const ndir = (dir + 3) % 6;
    const id1 = packEdge(q, r, dir);
    const id2 = packEdge(nq, nr, ndir);
    return id1 < id2 ? id1 : id2;
  }

  getDirectionVector(direction) {
    // Inlined or helper
    const dq = [1, 0, -1, -1, 0, 1][direction];
    const dr = [0, 1, 1, 0, -1, -1][direction];
    return { dq, dr };
  }

  solve() {
    // Process queue
    console.log('Solve start. Queue size:', (this.qTail - this.qHead + 20000) % 20000);
    let loops = 0;
    while (this.qHead !== this.qTail) {
      loops++;
      if (loops % 10000 === 0) {
        console.log('Loops:', loops, 'Head:', this.qHead, 'Tail:', this.qTail);
      }
      if (loops > 200000) {
        console.log('Solver stuck! qHead', this.qHead, 'qTail', this.qTail);
        return false;
      }

      const id = this.popQueue();
      if (id === -1) break;

      const { q, r } = unpack(id);

      // 1. Check Vertex Logic for all 6 corners
      let changed = false;
      for (let dir = 0; dir < 6; dir++) {
        if (this.applyVertexLogic(q, r, dir)) changed = true;
      }

      // 2. Check Hex Logic (if hint exists)
      if (this.hexShowNumbers[id]) {
        if (this.applyHexLogic(q, r, id)) changed = true;
      }

      // If changed, we might need to re-add?
      // No, setEdgeState adds neighbors to queue.
      // But if *this* hex changed, do we re-add self?
      // apply* functions return true if *edge* changed.
      // setEdgeState adds incident hexes of edge.
      // Incident hexes includes this one.
      // So setEdgeState handles requeueing.
    }

    // Verification step (optional but ensures completeness)
    // Just check if any edge is still UNKNOWN on active hexes?
    // If the queue is empty, and we started with all hexes, and all propagation handled...
    // Then we are stable.
    // Check if stable state is "solved" (all edges known).

    // Performance: Checking all edges takes time.
    // We can track "unknownEdgesCount" globally?
    // Or just iterate. Iterating 200 hexes * 6 edges is fast (~1200 checks).

    for (let i = 0; i < this.activeHexCount; i++) {
      const id = this.activeHexIds[i];
      const { q, r } = unpack(id);
      for (let dir = 0; dir < 6; dir++) {
        const eid = this.getCanonicalEdgeId(q, r, dir);
        if (this.edgeStates[eid] === 0) return false;
      }
    }
    return true;
  }

  setEdgeState(edgeId, state) {
    const current = this.edgeStates[edgeId];
    if (current !== state && current !== 0) {
      // Contradiction
      return false;
    }
    if (current === 0) {
      this.edgeStates[edgeId] = state;

      // We need coords to find neighbors
      // edgeId = (hexId << 3) | dir
      const hexId = edgeId >> 3;
      const dir = edgeId & 7;
      const { q, r } = unpack(hexId);

      this.edgeChanged(q, r, dir);

      return true;
    }
    return false;
  }

  applyVertexLogic(q, r, cornerIndex) {
    const e1Dir = (cornerIndex + 5) % 6;
    const e2Dir = cornerIndex;

    // Neighbors
    // Helper to get neighbor coords directly
    // q, r + dir vector
    const d1q = [1, 0, -1, -1, 0, 1][e1Dir];
    const d1r = [0, 1, 1, 0, -1, -1][e1Dir];
    const n1q = q + d1q;
    const n1r = r + d1r;

    const d2q = [1, 0, -1, -1, 0, 1][e2Dir];
    const d2r = [0, 1, 1, 0, -1, -1][e2Dir];
    const n2q = q + d2q;
    const n2r = r + d2r;

    const k1 = this.getCanonicalEdgeId(q, r, e1Dir);
    const k2 = this.getCanonicalEdgeId(q, r, e2Dir);

    let k3 = 0;

    // Check neighbors existence
    const n1Id = pack(n1q, n1r);
    const n2Id = pack(n2q, n2r);

    // Bounds check for packing? If q,r out of bounds.
    // pack handles it but array access might be undef.
    // hexExists is Uint8Array[16384].
    // if id out of range, undefined.
    // JS typed array access out of bounds returns undefined.

    if (this.hexExists[n1Id]) {
      const d = (cornerIndex + 1) % 6;
      k3 = this.getCanonicalEdgeId(n1q, n1r, d);
    } else if (this.hexExists[n2Id]) {
      const d = (cornerIndex + 4) % 6;
      k3 = this.getCanonicalEdgeId(n2q, n2r, d);
    }

    const s1 = this.edgeStates[k1];
    const s2 = this.edgeStates[k2];
    const s3 = k3 ? this.edgeStates[k3] : 2;

    let changed = false;
    let activeCount = 0;
    let unknownCount = 0;

    if (s1 === 1) activeCount++;
    else if (s1 === 0) unknownCount++;
    if (s2 === 1) activeCount++;
    else if (s2 === 0) unknownCount++;
    if (s3 === 1) activeCount++;
    else if (s3 === 0) unknownCount++; // s3=2 if k3=0

    if (activeCount === 2) {
      if (s1 === 0) {
        if (this.setEdgeState(k1, 2)) changed = true;
      }
      if (s2 === 0) {
        if (this.setEdgeState(k2, 2)) changed = true;
      }
      if (s3 === 0 && k3) {
        if (this.setEdgeState(k3, 2)) changed = true;
      }
    } else if (activeCount === 1 && unknownCount === 1) {
      if (s1 === 0) {
        if (this.setEdgeState(k1, 1)) changed = true;
      }
      if (s2 === 0) {
        if (this.setEdgeState(k2, 1)) changed = true;
      }
      if (s3 === 0 && k3) {
        if (this.setEdgeState(k3, 1)) changed = true;
      }
    } else if (activeCount === 0 && unknownCount === 1) {
      if (s1 === 0) {
        if (this.setEdgeState(k1, 2)) changed = true;
      }
      if (s2 === 0) {
        if (this.setEdgeState(k2, 2)) changed = true;
      }
      if (s3 === 0 && k3) {
        if (this.setEdgeState(k3, 2)) changed = true;
      }
    }
    return changed;
  }

  applyHexLogic(q, r, id) {
    const target = this.hexTargetCounts[id];
    // target is Int8.

    let active = 0;
    let unknown = 0;
    // Optimization: Unroll loop?
    for (let dir = 0; dir < 6; dir++) {
      const s = this.edgeStates[this.getCanonicalEdgeId(q, r, dir)];
      if (s === 1) active++;
      else if (s === 0) unknown++;
    }

    let changed = false;
    if (active === target && unknown > 0) {
      for (let dir = 0; dir < 6; dir++) {
        const k = this.getCanonicalEdgeId(q, r, dir);
        if (this.edgeStates[k] === 0) {
          if (this.setEdgeState(k, 2)) changed = true;
        }
      }
    } else if (active + unknown === target && unknown > 0) {
      for (let dir = 0; dir < 6; dir++) {
        const k = this.getCanonicalEdgeId(q, r, dir);
        if (this.edgeStates[k] === 0) {
          if (this.setEdgeState(k, 1)) changed = true;
        }
      }
    }
    return changed;
  }
}
// Alias the class to Solver
// End of Solver class

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

  // Reuse one solver
  const solver = new Solver(radius);

  for (const hex of hexList) {
    if (visibleCount <= minCount && difficulty !== 'hard') break;

    hex.showNumber = false;
    visibleCount--;

    // Reuse solver
    solver.reset(hexes);
    const solved = solver.solve();

    if (!solved) {
      hex.showNumber = true;
      visibleCount++;
    }
  }

  return mapData;
}

// Export functions for benchmarking
export { generateMap, processDifficulty, getKey, getNeighbor, getNeighbors, Solver };

// Parallel execution logic
if (isMainThread) {
  if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main();
  }
} else {
  runWorker();
}

function main() {
  const SIZES = {
    small: 2,
    medium: 4,
    large: 7,
    huge: 10,
  };

  const DIFFICULTIES = ['easy', 'medium', 'hard'];
  const MAPS_PER_SIZE = 200;

  // Prepare directories
  for (const sizeName of Object.keys(SIZES)) {
    for (const diff of DIFFICULTIES) {
      const dirPath = `maps/${sizeName}/${diff}`;
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
    }
  }

  // Create tasks
  const tasks = [];
  for (const [sizeName, radius] of Object.entries(SIZES)) {
    for (const diff of DIFFICULTIES) {
      const dirPath = `maps/${sizeName}/${diff}`;
      for (let i = 0; i < MAPS_PER_SIZE; i++) {
        tasks.push({
          radius,
          difficulty: diff,
          filename: `${dirPath}/${i}.bin`,
          sizeName, // for logging
        });
      }
    }
  }

  const numCPUs = os.cpus().length;
  const totalTasks = tasks.length;
  console.log(`Starting generation with ${numCPUs} threads. Total tasks: ${totalTasks}`);

  const startTime = Date.now();
  let completed = 0;
  let activeWorkers = 0;

  // Progress reporting
  const reportInterval = setInterval(() => {
    process.stdout.write(
      `\rProgress: ${completed}/${totalTasks} (${((completed / totalTasks) * 100).toFixed(1)}%)`,
    );
  }, 1000);

  // Worker handler
  for (let i = 0; i < numCPUs; i++) {
    const worker = new Worker(fileURLToPath(import.meta.url));
    activeWorkers++;

    worker.on('message', (msg) => {
      if (msg === 'done') {
        completed++;
        nextTask(worker);
      }
    });

    worker.on('error', (err) => {
      console.error('Worker error:', err);
    });

    worker.on('exit', (code) => {
      activeWorkers--;
      if (activeWorkers === 0) {
        clearInterval(reportInterval);
        const duration = (Date.now() - startTime) / 1000;
        console.log(`\nAll done in ${duration.toFixed(2)}s.`);
      }
    });

    nextTask(worker);
  }

  function nextTask(worker) {
    if (tasks.length > 0) {
      worker.postMessage(tasks.shift()); // FIFO for consistent order if that mattered, but popping is finer. Shift is fine.
    } else {
      worker.postMessage('exit');
    }
  }
}

function runWorker() {
  parentPort.on('message', (task) => {
    if (task === 'exit') {
      process.exit(0);
    }

    try {
      const { radius, difficulty, filename } = task;
      // Generate
      const mapData = generateMap(radius);
      processDifficulty(mapData, difficulty);
      saveBinaryMap(mapData, filename);

      parentPort.postMessage('done');
    } catch (e) {
      console.error('Worker failed task:', task, e);
      // Still signal done to keep going? Or crash?
      // Better to exit or signal error?
      // Let's just signal done so coordinator doesn't hang, but maybe log it.
      parentPort.postMessage('done');
    }
  });
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
