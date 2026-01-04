import { Grid } from './grid.js';
import { Renderer } from './renderer.js';
import { InputHandler } from './input.js';

type GameState = {
  radius: number;
  camera: { x: number; y: number; zoom: number };
};

class Game {
  canvas: HTMLCanvasElement;
  state: GameState;
  grid: Grid;
  renderer: Renderer;
  input: InputHandler;

  constructor() {
    this.canvas = document.getElementsByTagName('canvas')[0];
    this.state = {
      radius: 5,
      camera: { x: 0, y: 0, zoom: 1 },
    };
    this.grid = new Grid(this.state.radius);
    this.renderer = new Renderer(this.canvas, this.grid, this.state.camera);
    this.input = new InputHandler(this.canvas, this.state.camera, {
      onTap: (x, y) => {
        const hit = this.renderer.getHit(x, y);
        if (!hit) return;

        if (hit.type === 'hex') {
          const hex = hit.target;
          hex.active = (hex.active + 1) % 3;
        } else if (hit.type === 'edge') {
          const hex = hit.target;
          const edgeIndex = hit.edgeIndex!;
          // Toggle edge on current hex
          const currentState = hex.activeEdges[edgeIndex];
          const newState = (currentState + 1) % 3;

          this.grid.setEdgeState(hex.q, hex.r, edgeIndex, newState);
        }
      },
    });
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  loadMap(mapFile: string) {
    fetch(mapFile)
      .then((res: Response) => res.arrayBuffer())
      .then((buffer: ArrayBuffer) => {
        this.grid.loadBinaryMap(buffer);
        this.state.radius = this.grid.radius;
        this.renderer.render();

        // Update constraints
        const bounds = this.renderer.getGridBounds();
        this.input.updateConstraints(bounds, this.canvas.width, this.canvas.height);
      })
      .catch((err) => {
        console.error('Failed to load map:', err);
        // Fallback to default generated grid is already done above
      });
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    // Update constraints on resize
    this.input.updateConstraints(
      this.renderer.getGridBounds(),
      this.canvas.width,
      this.canvas.height
    );
    this.renderer.render();
  }

  loop() {
    this.renderer.render();
    requestAnimationFrame(() => this.loop());
  }
}

let game = new Game();
game.loadMap('map.bin');
game.loop();
