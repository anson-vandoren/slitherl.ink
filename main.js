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
const grid = new Grid(state.radius);
const renderer = new Renderer(canvas, grid, state.camera);
const input = new InputHandler(canvas, state.camera, {
  onTap: (x, y) => {
    const hit = renderer.getHit(x, y);
    if (!hit) return;

    if (hit.type === 'hex') {
      const hex = hit.target;
      hex.active = !hex.active;
      console.log('Tapped hex:', hex);
    } else if (hit.type === 'edge') {
      const hex = hit.target;
      const edgeIndex = hit.edgeIndex;
      // Toggle edge on current hex
      hex.activeEdges[edgeIndex] = !hex.activeEdges[edgeIndex];

      // Toggle shared edge on neighbor
      const neighbor = grid.getNeighbor(hex.q, hex.r, edgeIndex);
      if (neighbor) {
        const neighborEdgeIndex = (edgeIndex + 3) % 6;
        neighbor.activeEdges[neighborEdgeIndex] = !neighbor.activeEdges[neighborEdgeIndex];
        console.log('Toggled active neighbor edge:', neighborEdgeIndex, 'of hex:', neighbor);
      }

      console.log('Tapped edge:', edgeIndex, 'of hex:', hex);
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
