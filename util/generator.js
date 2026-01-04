const fs = require('fs');

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
  // Let's stick near the middle to have room to grow
  const insideSet = new Set();
  const startQ = 0;
  const startR = 0;

  insideSet.add(getKey(startQ, startR));
  hexes.get(getKey(startQ, startR)).active = 1;

  // Track potential candidates to grow "Inside"
  // A candidate is an Outside hex adjacent to an Inside hex
  let candidates = getNeighbors(startQ, startR)
    .filter((n) => hexes.has(getKey(n.q, n.r)))
    .map((n) => getKey(n.q, n.r));

  // Growth parameters
  const targetSize = Math.floor(hexes.size * 0.45); // Aim for ~45% fill

  while (insideSet.size < targetSize && candidates.length > 0) {
    // Improve selection: Prefer candidates that touch the FEWEST existing Inside hexes.
    // This encourages "spindly" growth and maximizes circumference.

    // 1. Calculate score (number of Inside neighbors) for each candidate
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

    // 2. Find minimum score
    let minScore = 6;
    for (const item of scoredCandidates) {
      if (item.score < minScore) minScore = item.score;
    }

    // 3. Filter candidates to only those with minScore
    const bestCandidates = scoredCandidates.filter((item) => item.score === minScore);

    // 4. Pick random from best candidates
    const randIndex = Math.floor(Math.random() * bestCandidates.length);
    const candidateKey = bestCandidates[randIndex].key;

    // Remove from main candidates list
    const candidateIndex = candidates.indexOf(candidateKey);
    candidates.splice(candidateIndex, 1);

    if (insideSet.has(candidateKey)) continue; // Already processed

    const hex = hexes.get(candidateKey);

    // Check if toggling this candidate to Inside breaks the connectivity of the Outside region.
    // If it does (creates an island), we skip it to preserve single loop topology.
    // Note: We also want to prevent Islets of Inside nodes if we only want 1 Inside region,
    // but our growth algorithm (expanding from center) naturally ensures Inside is connected.
    // So we mainly care about Outside connectivity.

    if (canToggle(hex, hexes, radius)) {
      hex.active = 1;
      insideSet.add(candidateKey);

      // Add new neighbors to candidates
      const neighbors = getNeighbors(hex.q, hex.r);
      for (const n of neighbors) {
        const k = getKey(n.q, n.r);
        if (hexes.has(k) && !insideSet.has(k) && !candidates.includes(k)) {
          candidates.push(k);
        }
      }
    }
  }

  // Post-processing: Extend Inside regions
  // Repeatedly find Outside hexes with exactly 1 Inside neighbor and toggle them to Inside.
  // This grows "spines" to fill available space without merging branches (which would require >1 neighbor).
  let changed = true;
  while (changed) {
    changed = false;
    const candidatesToExtend = [];

    for (const h of hexes.values()) {
      if (h.active === 2) {
        // Outside
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

    // Apply extensions
    for (const hex of candidatesToExtend) {
      // Re-check inside neighbors count to ensure it's still 1
      // (It might have increased if we just extended a neighbor of this one in this pass)
      const neighbors = getNeighbors(hex.q, hex.r);
      let insideCount = 0;
      for (const n of neighbors) {
        if (insideSet.has(getKey(n.q, n.r))) {
          insideCount++;
        }
      }

      if (insideCount === 1) {
        // Also check canToggle to be safe about Outside connectivity
        if (canToggle(hex, hexes, radius)) {
          hex.active = 1;
          insideSet.add(getKey(hex.q, hex.r));
          changed = true;
        }
      }
    }
  }

  // Calculate final circumference (number of edges between Inside and Outside)
  // And calculate target active active edge counts for each hex
  let circumference = 0;
  for (const h of hexes.values()) {
    h.targetCount = 0; // Initialize count
    h.showNumber = true; // Default to show number

    const neighbors = getNeighbors(h.q, h.r);
    for (const n of neighbors) {
      const nKey = getKey(n.q, n.r);
      const neighborHex = hexes.get(nKey);

      // Check if edge is active.
      // Edge is active if neighbor is in a different region.
      // If neighbor is missing (off map), it's considered Outside (2).
      let neighborActive = 2;
      if (neighborHex) {
        neighborActive = neighborHex.active;
      }

      if (h.active !== neighborActive) {
        h.targetCount++;
        // Only count circumference once per edge (e.g. from the Inside hex)
        if (h.active === 1) {
          circumference++;
        }
      }
    }
  }

  console.log(
    `Map generated with ${hexes.size} hexes. Inside size: ${insideSet.size}. Circumference: ${circumference}`
  );

  return {
    radius,
    hexes: Array.from(hexes.values()),
  };
}

/**
 * Checks if toggling a hex to Inside preserves the connectivity of the Outside graph.
 * This effectively checks if removing 'hex' from the 'Outside' set disconnects it.
 *
 * We use a simple local check (Euler characteristic/local connectivity) or full flood fill?
 * Full flood fill is expensive but correct. For small radius=5 maps (approx 91 hexes), it's fast enough.
 */
function canToggle(targetHex, allHexes, radius) {
  // Temporarily set to Inside (active=1)
  const key = getKey(targetHex.q, targetHex.r);
  targetHex.active = 1;

  // Topological Rule: No "Inside" loops within loops.
  // This is equivalent to saying that the "Outside" region must not have any holes.
  // In other words, every "Outside" hex must be able to reach the Map Boundary.
  // If an Outside hex cannot reach the boundary, it is trapped (a lake), which implies a second loop.

  // 1. Count total Outside hexes
  let totalOutside = 0;
  for (const h of allHexes.values()) {
    if (h.active === 2) totalOutside++;
  }

  // 2. Initialize Flood Fill from all Outside hexes on the Map Boundary
  const visited = new Set();
  const queue = [];

  for (const h of allHexes.values()) {
    if (h.active === 2) {
      // Check if on boundary
      const dist = Math.max(Math.abs(h.q), Math.abs(h.r), Math.abs(-h.q - h.r));
      if (dist === radius) {
        queue.push(h);
        visited.add(getKey(h.q, h.r));
      }
    }
  }

  // 3. Flood Fill
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

  // Revert change
  targetHex.active = 2;

  // 4. Validate
  // If we reached every outside node starting from the boundary, then there are no holes.
  return reachedCount === totalOutside;
}

// Run
const RADIUS = 5;
const mapData = generateMap(RADIUS);

// Save JSON (Legacy) for reference if needed, but we'll focus on binary
const outputData = JSON.stringify(mapData, null, 2);
// fs.writeFileSync('map.json', outputData);
// console.log(`Saved to map.json`);

// Save Binary
saveBinaryMap(mapData);

/**
 * Saves map data to a compact binary format.
 * Format:
 * [Radius (1 byte)]
 * [Hex Data (1 byte per hex)]
 *
 * Hex Data Byte Layout (LSB to MSB):
 * Bit 0: Inside (1) or Outside (0)
 * Bit 1-3: Active Edge Count (0-7)
 * Bit 4: Show Number Flag (1=Show, 0=Hide)
 * Bit 5-7: Reserved (0)
 */
function saveBinaryMap(mapData) {
  const radius = mapData.radius;
  const hexes = mapData.hexes;

  // Re-create the Map for easy lookup by q,r
  const hexMap = new Map();
  for (const h of hexes) {
    hexMap.set(getKey(h.q, h.r), h);
  }

  // Calculate buffer size
  // Count total hexes
  let totalHexes = 0;
  for (let q = -radius; q <= radius; q++) {
    const r1 = Math.max(-radius, -q - radius);
    const r2 = Math.min(radius, -q + radius);
    totalHexes += r2 - r1 + 1;
  }

  const bufferSize = 1 + totalHexes; // 1 byte for radius + 1 byte per hex
  const buffer = Buffer.alloc(bufferSize);

  // Write Radius
  buffer.writeUInt8(radius, 0);

  // Write Hexes
  let byteIndex = 1;

  for (let q = -radius; q <= radius; q++) {
    const r1 = Math.max(-radius, -q - radius);
    const r2 = Math.min(radius, -q + radius);
    for (let r = r1; r <= r2; r++) {
      const key = getKey(q, r);
      const hex = hexMap.get(key);

      // Default to Outside (2) -> 0, Count=0, Show=1 if missing
      // Region: Inside (1) -> 1, Outside (2) -> 0

      let regionBit = 0;
      let count = 0;
      let showNumber = 1; // Default to show

      if (hex) {
        regionBit = hex.active === 1 ? 1 : 0;
        count = hex.targetCount || 0;
        showNumber = hex.showNumber !== false ? 1 : 0;
      }

      // Pack byte
      // Bit 0: Region
      // Bits 1-3: Count
      // Bit 4: Show Number
      let packedByte = 0;
      packedByte |= regionBit & 0x1;
      packedByte |= (count & 0x7) << 1;
      packedByte |= (showNumber & 0x1) << 4;

      buffer.writeUInt8(packedByte, byteIndex);
      byteIndex++;
    }
  }

  fs.writeFileSync('map.bin', buffer);
  console.log(`Saved to map.bin (${buffer.length} bytes)`);
}
