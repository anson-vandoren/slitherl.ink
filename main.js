import { Grid } from './grid.js';
import { Renderer } from './renderer.js';
import { InputHandler } from './input.js';

const canvas = document.getElementById('app');

// Initial state
const state = {
  radius: 5,
  camera: { x: 0, y: 0, zoom: 1 },
};

// UI references
const radiusInput = document.getElementById('radius');
const radiusVal = document.getElementById('radius-val');

radiusInput.addEventListener('input', (e) => {
  const r = parseInt(e.target.value);
  state.radius = r;
  radiusVal.textContent = r;
  // Re-init grid
  renderer.grid = new Grid(state.radius);
  renderer.render();

  // Update constraints
  const bounds = renderer.getGridBounds();
  input.updateConstraints(bounds, canvas.width, canvas.height);
});

// Initialize modules
// Default radius if map fails
const grid = new Grid(state.radius);
const renderer = new Renderer(canvas, grid, state.camera);

// Load ID 0 map
// Load ID 0 map
fetch('map.bin')
  .then((res) => res.arrayBuffer())
  .then((buffer) => {
    grid.loadBinaryMap(buffer);
    state.radius = grid.radius;
    radiusVal.textContent = state.radius;
    renderer.render();

    // Update constraints
    const bounds = renderer.getGridBounds();
    input.updateConstraints(bounds, canvas.width, canvas.height);
  })
  .catch((err) => {
    console.error('Failed to load map:', err);
    // Fallback to default generated grid is already done above
  });
const input = new InputHandler(canvas, state.camera, {
  onTap: (x, y) => {
    const hit = renderer.getHit(x, y);
    if (!hit) return;

    if (hit.type === 'hex') {
      const hex = hit.target;
      hex.active = (hex.active + 1) % 3;
    } else if (hit.type === 'edge') {
      const hex = hit.target;
      const edgeIndex = hit.edgeIndex;
      // Toggle edge on current hex
      const currentState = hex.activeEdges[edgeIndex];
      const newState = (currentState + 1) % 3;

      grid.setEdgeState(hex.q, hex.r, edgeIndex, newState);
    }
  },
});

// Init constraints
input.updateConstraints(renderer.getGridBounds(), canvas.width, canvas.height);

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  // Update constraints on resize
  input.updateConstraints(renderer.getGridBounds(), canvas.width, canvas.height);
  renderer.render();
}

window.addEventListener('resize', resize);
resize();

// Start loop
function loop() {
  renderer.render();
  requestAnimationFrame(loop);
}

loop();
