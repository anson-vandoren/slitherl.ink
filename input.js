export class InputHandler {
  constructor(canvas, camera, callbacks) {
    this.canvas = canvas;
    this.camera = camera;
    this.callbacks = callbacks || {};
    this.isDragging = false;
    this.lastPos = { x: 0, y: 0 };
    this.dragStartPos = { x: 0, y: 0 };

    this.attachEvents();
  }

  attachEvents() {
    this.canvas.addEventListener('pointerdown', this.onPointerDown.bind(this));
    window.addEventListener('pointermove', this.onPointerMove.bind(this));
    window.addEventListener('pointerup', this.onPointerUp.bind(this));
    this.canvas.addEventListener('wheel', this.onWheel.bind(this));

    // Disable context menu
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  onPointerDown(e) {
    this.isDragging = true;
    this.lastPos = { x: e.clientX, y: e.clientY };
    this.dragStartPos = { x: e.clientX, y: e.clientY };
    this.canvas.setPointerCapture(e.pointerId);
  }

  onPointerMove(e) {
    if (!this.isDragging) return;

    const dx = e.clientX - this.lastPos.x;
    const dy = e.clientY - this.lastPos.y;

    this.camera.x += dx / this.camera.zoom;
    this.camera.y += dy / this.camera.zoom;

    this.lastPos = { x: e.clientX, y: e.clientY };
  }

  onPointerUp(e) {
    if (!this.isDragging) return;
    this.isDragging = false;
    this.canvas.releasePointerCapture(e.pointerId);

    const dist = Math.hypot(e.clientX - this.dragStartPos.x, e.clientY - this.dragStartPos.y);

    if (dist < 5 && this.callbacks.onTap) {
      this.callbacks.onTap(e.clientX, e.clientY);
    }
  }

  onWheel(e) {
    e.preventDefault();
    const zoomSensitivity = 0.001;
    const zoomFactor = Math.exp(-e.deltaY * zoomSensitivity);

    // Zoom towards mouse pointer
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left - rect.width / 2;
    const mouseY = e.clientY - rect.top - rect.height / 2;

    // Move camera to keep mouse position stable
    // current world pos of mouse:
    // wx = (mouseX - camX*zoom) / zoom -> no, screenX = worldX * zoom + camX_screen
    // wait, my render logic is: translate(w/2, h/2), translate(camX, camY), scale(z, z)
    // screenX = (worldX + camX) * zoom + width/2
    // worldX = (screenX - width/2) / zoom - camX

    // We want worldX at mouseX to stay same before and after zoom
    // (mouseX - w/2)/oldZoom - oldCamX = WorldX
    // (mouseX - w/2)/newZoom - newCamX = WorldX

    const w = this.canvas.width;
    const h = this.canvas.height;

    const wx = (e.clientX - w / 2) / this.camera.zoom - this.camera.x;
    const wy = (e.clientY - h / 2) / this.camera.zoom - this.camera.y;

    this.camera.zoom *= zoomFactor;
    this.camera.zoom = Math.max(0.1, Math.min(this.camera.zoom, 5));

    // New Cam Position
    this.camera.x = (e.clientX - w / 2) / this.camera.zoom - wx;
    this.camera.y = (e.clientY - h / 2) / this.camera.zoom - wy;
  }
}
