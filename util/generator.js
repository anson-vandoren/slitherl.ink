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

  // Calculate final circumference (number of edges between Inside and Outside)
  let circumference = 0;
  for (const h of hexes.values()) {
    if (h.active === 1) {
      // Inside
      const neighbors = getNeighbors(h.q, h.r);
      for (const n of neighbors) {
        const nKey = getKey(n.q, n.r);
        const neighborHex = hexes.get(nKey);
        // If neighbor is Outside (2) or doesn't exist (off map), it's a boundary edge
        // Note: Map boundary is effectively Outside for circumference purposes if we consider the map loop.
        // But usually we just count 1 vs 2 interfaces.
        // Let's count interfaces with 'active=2' hexes.
        if (neighborHex && neighborHex.active === 2) {
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

  // Pick an arbitrary Outside hex to start flood fill
  let startNode = null;
  // We can pick a boundary hex, as boundary hexes should usually be Outside
  // (unless our inside region touches the edge, which is allowed but risky for "loop" closing?
  // User said "one inside and one outside", implied boundary is outside)
  // Let's try to find ANY remaining Outside hex.
  for (const h of allHexes.values()) {
    if (h.active === 2) {
      startNode = h;
      break;
    }
  }

  if (!startNode) {
    // No outside hexes left?! Should not happen if we don't fill 100%
    targetHex.active = 2; // Revert
    return false;
  }

  // Count total Outside hexes
  let totalOutside = 0;
  for (const h of allHexes.values()) {
    if (h.active === 2) totalOutside++;
  }

  // Flood fill from startNode
  const visited = new Set();
  const queue = [startNode];
  visited.add(getKey(startNode.q, startNode.r));

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

  // If we reached all outside nodes, then connectivity is preserved
  return reachedCount === totalOutside;
}

// Run
const RADIUS = 5;
const mapData = generateMap(RADIUS);
const outputData = JSON.stringify(mapData, null, 2);

// Write to root/map.json as per plan to be served
fs.writeFileSync('map.json', outputData);
console.log(`Saved to map.json`);
