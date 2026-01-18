const RADIUS = 7; // Large map
const DIFFICULTY = 'hard';
const ITERATIONS = 5;

console.log(`Benchmarking Large Map (r=${RADIUS}) - ${DIFFICULTY} for ${ITERATIONS} iterations...`);

let totalTime = 0;

for (let i = 0; i < ITERATIONS; i++) {
  const mapData = generateMap(RADIUS);

  const start = performance.now();
  processDifficulty(mapData, DIFFICULTY);
  const end = performance.now();

  const duration = end - start;
  totalTime += duration;
  console.log(`Iteration ${i + 1}: ${duration.toFixed(2)}ms`); // Fixed: Use backticks for template literal
}

const avg = totalTime / ITERATIONS;
console.log(`Average processing time: ${avg.toFixed(2)}ms`);
