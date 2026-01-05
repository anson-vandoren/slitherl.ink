import { Grid, EdgeState, HexState } from './grid.js';
import { Renderer } from './renderer.js';
import { InputHandler } from './input.js';

type GameState = {
  radius: number;
  camera: { x: number; y: number; zoom: number };
};

type MapSize = 'small' | 'medium' | 'large';
type Difficulty = 'easy' | 'medium' | 'hard';

class ProgressManager {
  private storageKey = 'slitherlink_progress';

  getProgress(size: MapSize, difficulty: Difficulty): number {
    const data = this.loadData();
    return data[`${size}_${difficulty}`] || 0;
  }

  saveProgress(size: MapSize, difficulty: Difficulty, levelIndex: number) {
    const data = this.loadData();
    // Only update if we progressed further
    if ((data[`${size}_${difficulty}`] || 0) <= levelIndex) {
      data[`${size}_${difficulty}`] = levelIndex + 1; // Store next level index
      localStorage.setItem(this.storageKey, JSON.stringify(data));
    }
  }

  private loadData(): Record<string, number> {
    const stored = localStorage.getItem(this.storageKey);
    return stored ? JSON.parse(stored) : {};
  }
}

class Game {
  canvas: HTMLCanvasElement;
  state: GameState;
  grid: Grid;
  renderer: Renderer;
  input: InputHandler;
  progressManager: ProgressManager;

  currentSize: MapSize = 'medium';
  currentDifficulty: Difficulty = 'medium';
  currentLevelIndex: number = 0;

  constructor() {
    let canvas = document.getElementsByTagName('canvas').namedItem('app');
    if (!canvas) throw new Error('Canvas not found');
    this.canvas = canvas;

    this.state = {
      radius: 5,
      camera: { x: 0, y: 0, zoom: 1 },
    };
    this.grid = new Grid(this.state.radius);
    this.renderer = new Renderer(this.grid, this.state.camera);
    this.progressManager = new ProgressManager();

    this.input = new InputHandler(this.canvas, this.state.camera, {
      onTap: (x, y) => {
        const hit = this.renderer.getHit(this.canvas, x, y);
        if (!hit) return;

        if (hit.type === 'hex') {
          const hex = hit.target;
          hex.active = ((hex.active % 2) + 1) as HexState;
        } else if (hit.type === 'edge') {
          const hex = hit.target;
          const edgeIndex = hit.edgeIndex!;
          // Toggle edge on current hex
          const currentState = hex.activeEdges[edgeIndex] ?? EdgeState.UNKNOWN;
          const newState = ((currentState + 1) % 3) as EdgeState;

          this.grid.setEdgeState(hex.q, hex.r, edgeIndex, newState);

          // Check win condition (simple check for now, can be improved)
          this.checkWin();
        }
      },
    });

    this.initSplash();

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  initSplash() {
    const startBtn = document.getElementById('start-btn');
    const sizeSelect = document.getElementById('size-select') as HTMLSelectElement;
    const diffSelect = document.getElementById('difficulty-select') as HTMLSelectElement;
    const splash = document.getElementById('splash');
    const debugWinBtn = document.getElementById('debug-win-btn');

    if (startBtn && sizeSelect && diffSelect && splash) {
      startBtn.onclick = () => {
        this.currentSize = sizeSelect.value as MapSize;
        this.currentDifficulty = diffSelect.value as Difficulty;
        this.currentLevelIndex = this.progressManager.getProgress(
          this.currentSize,
          this.currentDifficulty
        );

        console.log(
          `Starting game: ${this.currentSize} ${this.currentDifficulty} Level ${this.currentLevelIndex}`
        );

        splash.classList.add('hidden');
        this.loadNextLevel();
      };
    }

    if (debugWinBtn) {
      debugWinBtn.onclick = () => {
        console.log('Simulating win...');
        this.progressManager.saveProgress(
          this.currentSize,
          this.currentDifficulty,
          this.currentLevelIndex
        );
        alert(`Level ${this.currentLevelIndex} Complete! Saved progress.`);
        this.currentLevelIndex++;
        this.loadNextLevel();
      };
    }
  }

  loadNextLevel() {
    // TODO: Logic to fetch specific map based on size/difficulty/index
    // For now, we just load 'map.bin' as a placeholder or we could fetch from a structured path
    // const mapPath = `maps/${this.currentSize}/${this.currentDifficulty}/${this.currentLevelIndex}.bin`;

    // FALLBACK for now since we don't have the directory structure yet
    const mapPath = 'map.bin';

    this.loadMap(mapPath);
  }

  checkWin() {
    if (this.grid.isSolved()) {
      console.log('Puzzle Solved!');
      // Slight delay to allow the last line to render
      setTimeout(() => {
        alert('Level Complete!');
        this.progressManager.saveProgress(
          this.currentSize,
          this.currentDifficulty,
          this.currentLevelIndex
        );
        this.currentLevelIndex++;
        this.loadNextLevel();
      }, 50);
    }
  }

  loadMap(mapFile: string) {
    fetch(mapFile)
      .then((res: Response) => {
        if (!res.ok) throw new Error(`Map not found: ${mapFile}`);
        return res.arrayBuffer();
      })
      .then((buffer: ArrayBuffer) => {
        console.log('Loading map binary...');
        this.grid.loadBinaryMap(buffer);
        this.state.radius = this.grid.radius;
        this.renderer.render(this.canvas);

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
    this.renderer.render(this.canvas);
  }

  loop() {
    this.renderer.render(this.canvas);
    requestAnimationFrame(() => this.loop());
  }
}

let game = new Game();
// Game entries point is now initSplash which waits for user input
game.loop();
