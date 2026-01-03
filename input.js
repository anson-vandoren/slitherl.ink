export class InputHandler {
  constructor(canvas, camera, callbacks) {
    this.canvas = canvas;
    this.camera = camera;
    this.callbacks = callbacks || {};
    this.isDragging = false;
    this.lastPos = { x: 0, y: 0 };
    this.dragStartPos = { x: 0, y: 0 };

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

    // Disable context menu
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  onPointerDown(e) {
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

  onPointerMove(e) {
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

      this.lastPos = { x: e.clientX, y: e.clientY };
    }
  }

  onPointerUp(e) {
    this.removeEvent(e);

    if (this.evCache.length < 2) {
      this.prevDiff = -1;
    }

    if (this.evCache.length === 0) {
      this.isDragging = false;
      this.canvas.releasePointerCapture(e.pointerId);

      const dist = Math.hypot(e.clientX - this.dragStartPos.x, e.clientY - this.dragStartPos.y);
      if (dist < 5 && this.callbacks.onTap) {
        this.callbacks.onTap(e.clientX, e.clientY);
      }
    } else if (this.evCache.length === 1) {
      // Resume panning with the remaining finger
      this.isDragging = true;
      this.lastPos = { x: this.evCache[0].clientX, y: this.evCache[0].clientY };
    }
  }

  removeEvent(e) {
    const index = this.evCache.findIndex((cachedEv) => cachedEv.pointerId === e.pointerId);
    if (index > -1) {
      this.evCache.splice(index, 1);
    }
  }

  onWheel(e) {
    e.preventDefault();
    const zoomSensitivity = 0.001;
    const zoomFactor = Math.exp(-e.deltaY * zoomSensitivity);
    this.applyZoom(zoomFactor, e.clientX, e.clientY);
  }

  applyZoom(factor, centerX, centerY) {
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
    this.camera.zoom = Math.max(0.1, Math.min(this.camera.zoom, 5));

    // Adjust camera to keep world position at center stable
    // (centerX - w/2) / newZoom - newCamX = wx
    // newCamX = (centerX - w/2) / newZoom - wx

    this.camera.x = (centerX - w / 2) / this.camera.zoom - wx;
    this.camera.y = (centerY - h / 2) / this.camera.zoom - wy;
  }
}
