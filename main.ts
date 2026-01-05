import { Grid, EdgeState, HexState } from './grid.js';
import { Renderer } from './renderer.js';
import { InputHandler } from './input.js';

type MapSize = 'small' | 'medium' | 'large' | 'huge';
type Difficulty = 'easy' | 'medium' | 'hard';

class ProgressManager {
  private progressKey = 'slitherlink_progress';
  private stateKeyPrefix = 'slitherlink_state_';

  getProgress(size: MapSize, difficulty: Difficulty): number {
    const data = this.loadProgress();
    return data[`${size}_${difficulty}`] || 0;
  }

  saveProgress(size: MapSize, difficulty: Difficulty, levelIndex: number) {
    const data = this.loadProgress();
    // Only update if we progressed further
    if ((data[`${size}_${difficulty}`] || 0) <= levelIndex) {
      data[`${size}_${difficulty}`] = levelIndex + 1; // Store next level index
      localStorage.setItem(this.progressKey, JSON.stringify(data));
    }
    // Clear active state for this size since we won
    localStorage.removeItem(this.activeStateKey(size));
  }

  saveActiveState(
    size: MapSize,
    difficulty: Difficulty,
    levelIndex: number,
    history: any[],
    historyIndex: number,
    camera: { x: number; y: number; zoom: number }
  ) {
    const state = {
      size,
      difficulty,
      levelIndex,
      history,
      historyIndex,
      camera,
      timestamp: Date.now(),
    };
    localStorage.setItem(this.activeStateKey(size), JSON.stringify(state));
  }

  loadActiveState(size: MapSize) {
    const stored = localStorage.getItem(this.activeStateKey(size));
    return stored ? JSON.parse(stored) : null;
  }

  hasActiveState(size: MapSize): boolean {
    return !!localStorage.getItem(this.activeStateKey(size));
  }

  private activeStateKey(size: MapSize) {
    return `${this.stateKeyPrefix}${size}`;
  }

  private loadProgress(): Record<string, number> {
    const stored = localStorage.getItem(this.progressKey);
    return stored ? JSON.parse(stored) : {};
  }
}

class Game {
  saveTimeout: number | null = null;
  canvas: HTMLCanvasElement;
  camera: { x: number; y: number; zoom: number };
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

    this.camera = { x: 0, y: 0, zoom: 1 };
    this.grid = new Grid();
    this.renderer = new Renderer(this.grid, this.camera);
    this.progressManager = new ProgressManager();

    this.input = new InputHandler(this.canvas, this.camera, {
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
          const currentState = this.grid.getEdgeState(hex.q, hex.r, edgeIndex);
          const newState = ((currentState + 1) % 3) as EdgeState;

          this.grid.setEdgeState(hex.q, hex.r, edgeIndex, newState);
          this.saveState();

          // Check win condition (simple check for now, can be improved)
          this.checkWin();
        }
      },
      onViewChange: () => {
        this.debouncedSave();
      },
    });

    this.initSplash();
    this.initNavigation();

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  initNavigation() {
    window.addEventListener('popstate', (event) => {
      // If we popped back to no state, show splash
      if (!event.state || event.state.view === 'splash') {
        this.showSplash();
      } else if (event.state.view === 'game') {
        // Potentially handle restoration if coming forward,
        // but for now we assume if we are already in game view we are good.
        // Actually, if we are in splash and go forward, we might need to restore.
        // For simplicity, mostly handling BACK to splash.
        this.hideSplash();
      }
    });

    // Check for existing active game of last used size (default medium)
    // Actually, maybe better to check all sizes or just wait for user selection?
    // User selection is safer to avoid auto-jumping into a game the user forgot about.
    // So we persist but don't auto-load on page refresh unless we want that behavior.
    // The request said "active_game_${size}", saving logic implies we support resuming.
    // Let's rely on Start Game button to resume or start new.

    // Actually, request says: "when reloading the page while a game is in progress, the map page is still shown"
    // So we DO need to auto-load.
    const lastSizeObj = localStorage.getItem('slitherlink_last_size');
    if (lastSizeObj) {
      const lastSize = lastSizeObj as MapSize;
      if (this.progressManager.hasActiveState(lastSize)) {
        this.currentSize = lastSize;
        const state = this.progressManager.loadActiveState(lastSize);
        if (state) {
          this.currentDifficulty = state.difficulty;
          this.currentLevelIndex = state.levelIndex;
          this.hideSplash();
          // Replace history state so we can go back
          history.replaceState({ view: 'game' }, '');
          this.loadNextLevel(true); // true = restoring
        }
      }
    }
  }

  saveState() {
    this.progressManager.saveActiveState(
      this.currentSize,
      this.currentDifficulty,
      this.currentLevelIndex,
      this.grid.history,
      this.grid.historyIndex,
      this.camera
    );
    // Update UI buttons state if needed
  }

  debouncedSave() {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = window.setTimeout(() => {
      this.saveState();
      this.saveTimeout = null;
    }, 200);
  }

  showSplash() {
    const splash = document.getElementById('splash');
    const controls = document.getElementById('game-controls');
    if (splash) splash.classList.remove('hidden');
    if (controls) controls.classList.add('hidden');
  }

  hideSplash() {
    const splash = document.getElementById('splash');
    const controls = document.getElementById('game-controls');
    if (splash) splash.classList.add('hidden');
    if (controls) controls.classList.remove('hidden');
  }

  initSplash() {
    const startBtn = document.getElementById('start-btn');
    const sizeSelect = document.getElementById('size-select') as HTMLSelectElement;
    const diffSelect = document.getElementById('difficulty-select') as HTMLSelectElement;
    const splash = document.getElementById('splash');

    if (startBtn && sizeSelect && diffSelect && splash) {
      const homeBtn = document.getElementById('home-btn');
      const undoBtn = document.getElementById('undo-btn');
      const redoBtn = document.getElementById('redo-btn');

      if (homeBtn) {
        homeBtn.onclick = () => {
          history.back(); // Simulate back button
        };
      }

      if (undoBtn) {
        undoBtn.onclick = () => {
          this.grid.undo();
          this.renderer.render(this.canvas);
          this.saveState();
        };
      }

      if (redoBtn) {
        redoBtn.onclick = () => {
          this.grid.redo();
          this.renderer.render(this.canvas);
          this.saveState();
        };
      }

      startBtn.onclick = () => {
        this.currentSize = sizeSelect.value as MapSize;
        this.currentDifficulty = diffSelect.value as Difficulty;

        localStorage.setItem('slitherlink_last_size', this.currentSize);

        // Check if there is an active game for this size to resume
        const state = this.progressManager.loadActiveState(this.currentSize);
        let restoring = false;

        if (state) {
          // We have a saved game. If it matches difficulty, resume it.
          // (If user changed difficulty in dropdown, maybe reset?
          //  But simple behavior: if active game exists for size, resume it regardless of dropdown difficulty,
          //  or prompt? Let's just resume and update difficulty to match state.)
          this.currentDifficulty = state.difficulty;
          this.currentLevelIndex = state.levelIndex;
          restoring = true;
        } else {
          // New game
          this.currentLevelIndex = this.progressManager.getProgress(
            this.currentSize,
            this.currentDifficulty
          );
        }

        console.log(
          `Starting game: ${this.currentSize} ${this.currentDifficulty} Level ${this.currentLevelIndex} (Restoring: ${restoring})`
        );

        this.hideSplash();
        history.pushState({ view: 'game' }, '');
        this.loadNextLevel(restoring);
      };
    }
  }

  loadNextLevel(restoring: boolean = false) {
    // Construct path to the map file
    const mapPath = `maps/${this.currentSize}/${this.currentLevelIndex}.bin`;

    this.loadMap(mapPath, restoring);
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

  loadMap(mapFile: string, restoring: boolean = false) {
    fetch(mapFile)
      .then((res: Response) => {
        if (!res.ok) throw new Error(`Map not found: ${mapFile}`);
        return res.arrayBuffer();
      })
      .then((buffer: ArrayBuffer) => {
        console.log('Loading map binary...');
        this.grid.loadBinaryMap(buffer);

        if (restoring) {
          const state = this.progressManager.loadActiveState(this.currentSize);
          if (state && state.history) {
            this.grid.loadHistory(state.history, state.historyIndex);
          }
          if (state && state.camera) {
            this.camera.x = state.camera.x;
            this.camera.y = state.camera.y;
            this.camera.zoom = state.camera.zoom;
          }
        } else {
          // New game, save initial state
          this.saveState();
        }

        this.renderer.render(this.canvas);

        // Update constraints
        const bounds = this.renderer.getGridBounds();
        this.input.updateConstraints(bounds, this.canvas.width, this.canvas.height);
      })
      .catch((err) => {
        console.error('Failed to load map:', err);
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
