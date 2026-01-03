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
      // Note: Ideally we should also find the neighbor and toggle its shared edge.
      // But for this MVP, visual feedback on one hex is sufficient.
      console.log('Tapped edge:', edgeIndex, 'of hex:', hex);
    }
  },
});

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
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
