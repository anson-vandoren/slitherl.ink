import { Grid } from './grid.js';
import { Renderer } from './renderer.js';
import { InputHandler } from './input.js';
class ProgressManager {
    storageKey = 'slitherlink_progress';
    getProgress(size, difficulty) {
        const data = this.loadData();
        return data[`${size}_${difficulty}`] || 0;
    }
    saveProgress(size, difficulty, levelIndex) {
        const data = this.loadData();
        // Only update if we progressed further
        if ((data[`${size}_${difficulty}`] || 0) <= levelIndex) {
            data[`${size}_${difficulty}`] = levelIndex + 1; // Store next level index
            localStorage.setItem(this.storageKey, JSON.stringify(data));
        }
    }
    loadData() {
        const stored = localStorage.getItem(this.storageKey);
        return stored ? JSON.parse(stored) : {};
    }
}
class Game {
    canvas;
    state;
    grid;
    renderer;
    input;
    progressManager;
    currentSize = 'medium';
    currentDifficulty = 'medium';
    currentLevelIndex = 0;
    constructor() {
        let canvas = document.getElementsByTagName('canvas').namedItem('app');
        if (!canvas)
            throw new Error('Canvas not found');
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
                if (!hit)
                    return;
                if (hit.type === 'hex') {
                    const hex = hit.target;
                    hex.active = ((hex.active % 2) + 1);
                }
                else if (hit.type === 'edge') {
                    const hex = hit.target;
                    const edgeIndex = hit.edgeIndex;
                    // Toggle edge on current hex
                    const currentState = this.grid.getEdgeState(hex.q, hex.r, edgeIndex);
                    const newState = ((currentState + 1) % 3);
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
        const sizeSelect = document.getElementById('size-select');
        const diffSelect = document.getElementById('difficulty-select');
        const splash = document.getElementById('splash');
        if (startBtn && sizeSelect && diffSelect && splash) {
            startBtn.onclick = () => {
                this.currentSize = sizeSelect.value;
                this.currentDifficulty = diffSelect.value;
                this.currentLevelIndex = this.progressManager.getProgress(this.currentSize, this.currentDifficulty);
                console.log(`Starting game: ${this.currentSize} ${this.currentDifficulty} Level ${this.currentLevelIndex}`);
                splash.classList.add('hidden');
                this.loadNextLevel();
            };
        }
    }
    loadNextLevel() {
        // Construct path to the map file
        const mapPath = `maps/${this.currentSize}/${this.currentLevelIndex}.bin`;
        this.loadMap(mapPath);
    }
    checkWin() {
        if (this.grid.isSolved()) {
            console.log('Puzzle Solved!');
            // Slight delay to allow the last line to render
            setTimeout(() => {
                alert('Level Complete!');
                this.progressManager.saveProgress(this.currentSize, this.currentDifficulty, this.currentLevelIndex);
                this.currentLevelIndex++;
                this.loadNextLevel();
            }, 50);
        }
    }
    loadMap(mapFile) {
        fetch(mapFile)
            .then((res) => {
            if (!res.ok)
                throw new Error(`Map not found: ${mapFile}`);
            return res.arrayBuffer();
        })
            .then((buffer) => {
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
        this.input.updateConstraints(this.renderer.getGridBounds(), this.canvas.width, this.canvas.height);
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
