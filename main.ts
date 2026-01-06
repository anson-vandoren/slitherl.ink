import { Grid, EdgeState } from './grid.js';
import { Renderer } from './renderer.js';
import { InputHandler } from './input.js';

type MapSize = 'small' | 'medium' | 'large' | 'huge';
type Difficulty = 'easy' | 'medium' | 'hard';

class ProgressManager {
  private progressKey = 'slitherlink_progress';
  private statsKey = 'slitherlink_stats';
  private stateKeyPrefix = 'slitherlink_state_';
  private viewKeyPrefix = 'slitherlink_view_';

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

  saveGameHistory(
    size: MapSize,
    difficulty: Difficulty,
    levelIndex: number,
    history: any[],
    historyIndex: number,
    edgeColors?: [string, number][]
  ) {
    this.saveGameHistoryWithTime(
      size,
      difficulty,
      levelIndex,
      history,
      historyIndex,
      0, // Default to 0 if not using the time-aware method directly, thought Game class should handle this
      edgeColors
    );
  }

  saveGameHistoryWithTime(
    size: MapSize,
    difficulty: Difficulty,
    levelIndex: number,
    history: any[],
    historyIndex: number,
    elapsedTime: number,
    edgeColors?: [string, number][] // Serialized map
  ) {
    const state = {
      size,
      difficulty,
      levelIndex,
      history,
      historyIndex,
      elapsedTime,
      edgeColors,
      timestamp: Date.now(),
    };
    localStorage.setItem(this.activeStateKey(size), JSON.stringify(state));
  }

  saveViewState(size: MapSize, camera: { x: number; y: number; zoom: number }) {
    const state = {
      camera,
      timestamp: Date.now(),
    };
    localStorage.setItem(this.activeViewKey(size), JSON.stringify(state));
  }

  loadActiveState(size: MapSize) {
    const storedState = localStorage.getItem(this.activeStateKey(size));
    const storedView = localStorage.getItem(this.activeViewKey(size));

    if (!storedState) return null;

    const state = JSON.parse(storedState);
    if (storedView) {
      const view = JSON.parse(storedView);
      if (view.camera) {
        state.camera = view.camera;
      }
    }
    return state;
  }

  hasActiveState(size: MapSize): boolean {
    return !!localStorage.getItem(this.activeStateKey(size));
  }

  private activeStateKey(size: MapSize) {
    return `${this.stateKeyPrefix}${size}`;
  }

  private activeViewKey(size: MapSize) {
    return `${this.viewKeyPrefix}${size}`;
  }

  private loadProgress(): Record<string, number> {
    const stored = localStorage.getItem(this.progressKey);
    return stored ? JSON.parse(stored) : {};
  }

  saveCompletionTime(size: MapSize, difficulty: Difficulty, time: number) {
    const stats = this.loadStats();
    const key = `${size}_${difficulty}`;
    if (!stats[key]) {
      stats[key] = [];
    }
    stats[key].push(time);
    localStorage.setItem(this.statsKey, JSON.stringify(stats));
  }

  getStats(size: MapSize, difficulty: Difficulty) {
    const stats = this.loadStats();
    const times = stats[`${size}_${difficulty}`] || [];
    if (times.length === 0) return null;

    times.sort((a: number, b: number) => a - b);
    const sum = times.reduce((a: number, b: number) => a + b, 0);
    const mean = sum / times.length;
    const median =
      times.length % 2 === 0
        ? (times[times.length / 2 - 1]! + times[times.length / 2]!) / 2
        : times[Math.floor(times.length / 2)]!;

    return {
      fastest: times[0],
      slowest: times[times.length - 1],
      mean,
      median,
      count: times.length,
    };
  }

  private loadStats(): Record<string, number[]> {
    const stored = localStorage.getItem(this.statsKey);
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

  sessionStartTime: number | null = null;
  accumulatedTime: number = 0;
  isPaused: boolean = false;

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
          this.grid.cycleHexColor(hex);
        } else if (hit.type === 'edge') {
          const hex = hit.target;
          const edgeIndex = hit.edgeIndex!;
          // Toggle edge on current hex
          const currentState = this.grid.getEdgeState(hex.q, hex.r, edgeIndex);
          const newState = ((currentState + 1) % 3) as EdgeState;

          this.grid.setEdgeState(hex.q, hex.r, edgeIndex, newState);
          this.grid.handleEdgeChange(hex.q, hex.r, edgeIndex, newState); // handle splits

          this.saveGameHistory();

          // Check win condition (simple check for now, can be improved)
          this.checkWin();
          this.updateButtonStates();
        }
      },
      onLongPress: (x, y) => {
        const hit = this.renderer.getHit(this.canvas, x, y);
        if (!hit || hit.type !== 'edge') return;

        const hex = hit.target;
        const edgeIndex = hit.edgeIndex!;

        const state = this.grid.getEdgeState(hex.q, hex.r, edgeIndex);
        if (state !== EdgeState.ACTIVE) return; // Only color connected active edges

        const currentColor = this.grid.getEdgeColor(hex.q, hex.r, edgeIndex);
        if (currentColor === 0) {
          this.grid.applyColorToComponent(hex.q, hex.r, edgeIndex);
        } else {
          this.grid.clearColorFromComponent(hex.q, hex.r, edgeIndex);
        }
        this.saveGameHistory();
        this.renderer.render(this.canvas);
      },
      onViewChange: () => {
        // View change happens on every frame of drag/zoom.
        // We might not need to save here anymore if we use onDragEnd / onZoom
      },
      onDragEnd: () => {
        this.saveViewState();
      },
      onZoom: () => {
        this.debouncedSaveViewState();
      },
    });

    this.initSplash();
    this.initWinScreen();
    this.initResetModal();
    this.initNavigation();

    this.initNavigation();

    document.addEventListener('visibilitychange', () => {
      this.handleVisibilityChange();
    });

    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.updateButtonStates();
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
          // Build history stack so back button works:
          // 1. Base is splash
          history.replaceState({ view: 'splash' }, '');
          // 2. Push game state on top
          history.pushState({ view: 'game' }, '');
          this.loadNextLevel(true); // true = restoring
        }
      }
    }
  }

  handleVisibilityChange() {
    if (document.hidden) {
      // Game hidden, pause timer
      if (this.sessionStartTime !== null) {
        this.accumulatedTime += Date.now() - this.sessionStartTime;
        this.sessionStartTime = null;
      }
      this.saveGameHistory();
    } else {
      // Game visible, resume timer if we have an active game
      // We assume if we are on the game view, we resume.
      // But we might be on splash screen.
      // Ideally we only resume if we are actually playing.
      // For now, if currentLevelIndex is set and we're not just initializing...
      // Let's rely on loadMap starting the session.
      // But if we just tabbed back in?
      const winScreen = document.getElementById('win-screen');
      const splash = document.getElementById('splash');
      if (splash?.classList.contains('hidden') && winScreen?.classList.contains('hidden')) {
        this.sessionStartTime = Date.now();
      }
    }
  }

  getTime(): number {
    if (this.sessionStartTime !== null) {
      return this.accumulatedTime + (Date.now() - this.sessionStartTime);
    }
    return this.accumulatedTime;
  }

  saveGameHistory() {
    this.progressManager.saveGameHistoryWithTime(
      this.currentSize,
      this.currentDifficulty,
      this.currentLevelIndex,
      this.grid.history,
      this.grid.historyIndex,
      this.getTime(),
      Array.from(this.grid.edgeColors)
    );
    // Update UI buttons state if needed
  }

  saveViewState() {
    this.progressManager.saveViewState(this.currentSize, this.camera);
  }

  debouncedSaveViewState() {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = window.setTimeout(() => {
      this.saveViewState();
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

  showWinScreen(stats: any = null, currentTime: number = 0) {
    const winScreen = document.getElementById('win-screen');
    const controls = document.getElementById('game-controls');
    const title = winScreen?.querySelector('h1');
    const btn = document.getElementById('next-level-btn');
    const statsContainer = document.getElementById('level-stats');

    if (title) title.innerText = 'Level Complete!';

    if (statsContainer && stats) {
      const formatTime = (ms: number) => {
        const s = Math.floor(ms / 1000);
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${m}:${sec.toString().padStart(2, '0')}`;
      };

      let html = `
            <div class="stat-row highlight">
                <span>Time:</span>
                <span>${formatTime(currentTime)}</span>
            </div>
        `;

      if (stats) {
        html += `
                <div class="stat-grid">
                    <div class="stat-item">
                        <span class="label">Fastest</span>
                        <span class="value">${formatTime(stats.fastest)}</span>
                    </div>
                    <div class="stat-item">
                        <span class="label">Average</span>
                        <span class="value">${formatTime(stats.mean)}</span>
                    </div>
                </div>
            `;
      }
      statsContainer.innerHTML = html;
      statsContainer.classList.remove('hidden');
    } else if (statsContainer) {
      statsContainer.innerHTML = '';
      statsContainer.classList.add('hidden');
    }

    if (btn) {
      btn.innerText = 'Next Level';
      btn.onclick = async () => {
        // Progress was already saved when win screen was shown
        this.currentLevelIndex++;
        const success = await this.loadNextLevel();
        if (success) {
          this.hideWinScreen();
        } else {
          // No more levels, revert index and show completion
          this.currentLevelIndex--;
          this.showCompletionScreen();
        }
      };
    }

    if (winScreen) winScreen.classList.remove('hidden');
    if (controls) controls.classList.add('hidden');
  }

  showCompletionScreen() {
    const winScreen = document.getElementById('win-screen');
    const controls = document.getElementById('game-controls');
    const title = winScreen?.querySelector('h1');
    const btn = document.getElementById('next-level-btn');

    if (title) title.innerText = 'All Levels Complete!';
    if (btn) {
      btn.innerText = 'Back to Menu';
      btn.onclick = () => {
        this.hideWinScreen();
        this.showSplash();
      };
    }

    if (winScreen) winScreen.classList.remove('hidden');
    if (controls) controls.classList.add('hidden');
  }

  hideWinScreen() {
    const winScreen = document.getElementById('win-screen');
    const controls = document.getElementById('game-controls');
    if (winScreen) winScreen.classList.add('hidden');
    if (controls) controls.classList.remove('hidden');
  }

  initWinScreen() {
    // Logic moved to showWinScreen to ensure fresh state every time
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
          this.saveGameHistory();
          this.updateButtonStates();
        };
      }

      if (redoBtn) {
        redoBtn.onclick = () => {
          this.grid.redo();
          this.renderer.render(this.canvas);
          this.saveGameHistory();
          this.updateButtonStates();
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
        this.loadNextLevel(restoring).then((success) => {
          if (!success && !restoring) {
            // New game failed to load level (likely all complete)
            this.showCompletionScreen();
          } else if (!success && restoring) {
            alert('Could not restore active game.');
            this.showSplash();
          }
          this.updateButtonStates();
        });
      };
    }
  }

  initResetModal() {
    const resetBtn = document.getElementById('reset-btn');
    const modal = document.getElementById('reset-modal');
    const cancelBtn = document.getElementById('reset-cancel-btn');
    const confirmBtn = document.getElementById('reset-confirm-btn');

    if (resetBtn && modal && cancelBtn && confirmBtn) {
      resetBtn.onclick = () => {
        modal.classList.remove('hidden');
      };

      cancelBtn.onclick = () => {
        modal.classList.add('hidden');
      };

      confirmBtn.onclick = () => {
        this.grid.resetToStart();
        this.renderer.render(this.canvas);
        this.saveGameHistory();
        this.updateButtonStates();
        modal.classList.add('hidden');
      };
    }
  }

  updateButtonStates() {
    const undoBtn = document.getElementById('undo-btn') as HTMLButtonElement;
    const redoBtn = document.getElementById('redo-btn') as HTMLButtonElement;

    if (undoBtn) {
      if (this.grid.canUndo) {
        undoBtn.classList.remove('disabled');
        undoBtn.disabled = false;
      } else {
        undoBtn.classList.add('disabled');
        undoBtn.disabled = true;
      }
    }

    if (redoBtn) {
      if (this.grid.canRedo) {
        redoBtn.classList.remove('disabled');
        redoBtn.disabled = false;
      } else {
        redoBtn.classList.add('disabled');
        redoBtn.disabled = true;
      }
    }
  }

  async loadNextLevel(restoring: boolean = false): Promise<boolean> {
    // Construct path to the map file
    const mapPath = `maps/${this.currentSize}/${this.currentLevelIndex}.bin`;

    const success = await this.loadMap(mapPath, restoring);
    if (!success) {
      if (restoring) {
        // If we failed to restore, something is wrong, back to splash
        console.error('Failed to restore active game');
        this.showSplash();
      }
      return false;
    }
    return true;
  }

  checkWin() {
    if (this.grid.isSolved()) {
      console.log('Puzzle Solved!');
      const finalTime = this.getTime();
      this.sessionStartTime = null; // Stop timer
      this.accumulatedTime = finalTime;

      this.progressManager.saveCompletionTime(this.currentSize, this.currentDifficulty, finalTime);

      const stats = this.progressManager.getStats(this.currentSize, this.currentDifficulty);

      // Slight delay to allow the last line to render
      setTimeout(() => {
        this.progressManager.saveProgress(
          this.currentSize,
          this.currentDifficulty,
          this.currentLevelIndex
        );
        this.showWinScreen(stats, finalTime);
      }, 50);
    }
  }

  async loadMap(mapFile: string, restoring: boolean = false): Promise<boolean> {
    try {
      const res = await fetch(mapFile);
      if (!res.ok) {
        if (res.status === 404) return false;
        throw new Error(`Map not found: ${mapFile}`);
      }

      const buffer = await res.arrayBuffer();
      console.log('Loading map binary...');
      this.grid.loadBinaryMap(buffer);

      if (restoring) {
        const state = this.progressManager.loadActiveState(this.currentSize);
        if (state) {
          if (state.history) {
            this.grid.loadHistory(state.history, state.historyIndex);
          }
          if (state.camera) {
            this.camera.x = state.camera.x;
            this.camera.y = state.camera.y;
            this.camera.zoom = state.camera.zoom;
          }
          // Restore time
          if (typeof state.elapsedTime === 'number') {
            this.accumulatedTime = state.elapsedTime;
          }
          if (state.edgeColors) {
            this.grid.edgeColors = new Map(state.edgeColors);
          }
        }
      } else {
        // New game, save initial state
        this.accumulatedTime = 0;
        this.saveGameHistory();
        this.saveViewState();
      }

      this.sessionStartTime = Date.now(); // Start timer

      this.renderer.render(this.canvas);
      this.updateButtonStates();

      // Update constraints
      const bounds = this.renderer.getGridBounds();
      this.input.updateConstraints(bounds, this.canvas.width, this.canvas.height);
      return true;
    } catch (err) {
      console.error('Failed to load map:', err);
      return false;
    }
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
