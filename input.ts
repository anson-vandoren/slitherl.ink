interface Callbacks {
  onTap?: (x: number, y: number) => void;
}

export class InputHandler {
  canvas: HTMLCanvasElement;
  camera: { x: number; y: number; zoom: number };
  callbacks: Callbacks;
  lastPos: { x: number; y: number };
  dragStartPos: { x: number; y: number };
  bounds: { minX: number; maxX: number; minY: number; maxY: number; width: number; height: number };
  minZoom: number;
  evCache: PointerEvent[];
  prevDiff: number;
  isDragging: boolean = false;

  constructor(
    canvas: HTMLCanvasElement,
    camera: { x: number; y: number; zoom: number },
    callbacks?: Callbacks
  ) {
    this.canvas = canvas;
    this.camera = camera;
    this.callbacks = callbacks || {};
    this.lastPos = { x: 0, y: 0 };
    this.dragStartPos = { x: 0, y: 0 };

    // Constraints
    this.bounds = { minX: -100, maxX: 100, minY: -100, maxY: 100, width: 200, height: 200 };
    this.minZoom = 0.1;

    // Pinch-to-zoom state
    this.evCache = [];
    this.prevDiff = -1;

    this.attachEvents();
  }

  attachEvents() {
    this.canvas.addEventListener('pointerdown', this.onPointerDown.bind(this));
    window.addEventListener('pointermove', this.onPointerMove.bind(this));
    window.addEventListener('pointerup', this.onPointerUp.bind(this));
    window.addEventListener('pointercancel', this.onPointerUp.bind(this));
    window.addEventListener('pointerout', this.onPointerUp.bind(this));
    window.addEventListener('pointerleave', this.onPointerUp.bind(this));
    this.canvas.addEventListener('wheel', this.onWheel.bind(this), { passive: false });
  }

  updateConstraints(
    bounds: {
      minX: number;
      maxX: number;
      minY: number;
      maxY: number;
      width: number;
      height: number;
    },
    viewportWidth: number,
    viewportHeight: number
  ) {
    this.bounds = bounds;

    // minZoom calculation: grid should take up at least 2/3 of smallest viewport dimension
    const minViewportDim = Math.min(viewportWidth, viewportHeight);
    const targetGridSize = minViewportDim * (2 / 3);
    const maxGridDim = Math.max(bounds.width, bounds.height);

    this.minZoom = targetGridSize / maxGridDim;

    // Enforce current zoom
    if (this.camera.zoom < this.minZoom) {
      this.camera.zoom = this.minZoom;
    }

    this.clampCamera();
  }

  clampCamera() {
    // Prevent panning too far.
    // Ensure that at least some part of the grid is always visible (intersect viewport)

    const vpW_world = this.canvas.width / this.camera.zoom;
    const vpH_world = this.canvas.height / this.camera.zoom;

    // We want the viewport center (camera.x, camera.y) to be constrained
    // such that the viewport STRICTLY intersects the grid bounds.
    // To ensure at least 200 units of overlap (approx 3 hexes), or half screen if zoomed in:
    const overlapX = Math.min(200, vpW_world / 2);
    const overlapY = Math.min(200, vpH_world / 2);

    const marginX = vpW_world / 2 - overlapX;
    const marginY = vpH_world / 2 - overlapY;

    // If viewport is smaller than grid, margin might be negative?
    // No, logic holds. If we want overlap, center cannot go beyond edge + half_vp - overlap.

    // HOWEVER, if grid is smaller than viewport (zoomed out min), we want to center it?
    // If minZoom constraint works, grid is approx 2/3 of viewport.
    // So viewport IS larger than grid in world space?
    // Grid size 500. Viewport world size 500 / 0.6 = 800.
    // vpW_world > gridWidth.
    // marginX = 400 - 200 = 200.
    // bounds.minX ~ -250.
    // minX - margin = -450.
    // bounds.maxX ~ 250.
    // maxX + margin = 450.
    // Camera can roam -450 to 450.
    // Viewport covers -950 to -150 (left side) -> Grid is at -250 to 250.
    // -150 overlaps -250..250. Correct.

    this.camera.x = Math.max(
      this.bounds.minX - marginX,
      Math.min(this.camera.x, this.bounds.maxX + marginX)
    );
    this.camera.y = Math.max(
      this.bounds.minY - marginY,
      Math.min(this.camera.y, this.bounds.maxY + marginY)
    );
  }

  onPointerDown(e: PointerEvent) {
    // Prevent default browser behaviors like text selection or scrolling
    e.preventDefault();

    this.evCache.push(e);
    this.canvas.setPointerCapture(e.pointerId);

    if (this.evCache.length === 1) {
      // Single touch - start panning
      this.isDragging = true;
      this.lastPos = { x: e.clientX, y: e.clientY };
      this.dragStartPos = { x: e.clientX, y: e.clientY };
    } else if (this.evCache.length === 2) {
      // Multi touch - start pinching, stop panning
      this.isDragging = false;
      this.prevDiff = Math.hypot(
        this.evCache[0].clientX - this.evCache[1].clientX,
        this.evCache[0].clientY - this.evCache[1].clientY
      );
    }
  }

  onPointerMove(e: PointerEvent) {
    // Update event in cache
    const index = this.evCache.findIndex((cachedEv) => cachedEv.pointerId === e.pointerId);
    if (index > -1) {
      this.evCache[index] = e;
    }

    if (this.evCache.length === 2) {
      // Pinch-to-zoom
      const curDiff = Math.hypot(
        this.evCache[0].clientX - this.evCache[1].clientX,
        this.evCache[0].clientY - this.evCache[1].clientY
      );

      if (this.prevDiff > 0) {
        // Calculate zoom center (midpoint between two fingers)
        const midX = (this.evCache[0].clientX + this.evCache[1].clientX) / 2;
        const midY = (this.evCache[0].clientY + this.evCache[1].clientY) / 2;

        const zoomFactor = curDiff / this.prevDiff;
        this.applyZoom(zoomFactor, midX, midY);
      }

      this.prevDiff = curDiff;
    } else if (this.evCache.length === 1 && this.isDragging) {
      // Panning
      const dx = e.clientX - this.lastPos.x;
      const dy = e.clientY - this.lastPos.y;

      this.camera.x += dx / this.camera.zoom;
      this.camera.y += dy / this.camera.zoom;

      this.clampCamera();

      this.lastPos = { x: e.clientX, y: e.clientY };
    }
  }

  onPointerUp(e: PointerEvent) {
    // 1. Check if we were actually tracking this pointer
    const index = this.evCache.findIndex((cachedEv) => cachedEv.pointerId === e.pointerId);

    // If not found, it's a duplicate event (like a trailing pointerleave), so ignore it.
    if (index === -1) return;

    // 2. Remove it
    this.evCache.splice(index, 1);

    // 3. Reset pinch diff if needed
    if (this.evCache.length < 2) {
      this.prevDiff = -1;
    }

    // 4. Handle Tap/End Drag
    if (this.evCache.length === 0) {
      this.isDragging = false;
      this.canvas.releasePointerCapture(e.pointerId);

      const dist = Math.hypot(e.clientX - this.dragStartPos.x, e.clientY - this.dragStartPos.y);

      // (Optional: Keep the 15px tolerance from before, it's still good practice for mobile)
      if (dist < 15 && this.callbacks.onTap) {
        this.callbacks.onTap(e.clientX, e.clientY);
      }
    } else if (this.evCache.length === 1) {
      // Resume panning with the remaining finger
      this.isDragging = true;
      this.lastPos = { x: this.evCache[0].clientX, y: this.evCache[0].clientY };
    }
  }

  onWheel(e: WheelEvent) {
    e.preventDefault();
    const zoomSensitivity = 0.001;
    const zoomFactor = Math.exp(-e.deltaY * zoomSensitivity);
    this.applyZoom(zoomFactor, e.clientX, e.clientY);
  }

  applyZoom(factor: number, centerX: number, centerY: number) {
    const rect = this.canvas.getBoundingClientRect();

    // Calculate world position of center before zoom
    // screenX = (worldX + camX) * zoom + width/2
    // worldX = (screenX - width/2) / zoom - camX

    const w = this.canvas.width;
    const h = this.canvas.height;

    const wx = (centerX - w / 2) / this.camera.zoom - this.camera.x;
    const wy = (centerY - h / 2) / this.camera.zoom - this.camera.y;

    // Apply zoom
    this.camera.zoom *= factor;
    this.camera.zoom = Math.max(this.minZoom, Math.min(this.camera.zoom, 5));

    // Adjust camera to keep world position at center stable
    // (centerX - w/2) / newZoom - newCamX = wx
    // newCamX = (centerX - w/2) / newZoom - wx

    this.camera.x = (centerX - w / 2) / this.camera.zoom - wx;
    this.camera.y = (centerY - h / 2) / this.camera.zoom - wy;

    this.clampCamera();
  }
}
