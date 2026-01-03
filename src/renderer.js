export class Renderer {
  constructor(canvas, grid, camera) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.grid = grid;
    this.camera = camera;
    this.hexSize = 30; // Base size of hexagon
  }

  render() {
    this.ctx.fillStyle = '#1d2021'; // Gruvbox bg0_hard
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.ctx.strokeStyle = '#928374'; // Gruvbox gray
    this.ctx.lineWidth = 1;
    this.ctx.setLineDash([5, 5]);

    this.ctx.save();
    // Center the camera
    this.ctx.translate(this.canvas.width / 2, this.canvas.height / 2);
    this.ctx.translate(this.camera.x, this.camera.y);
    this.ctx.scale(this.camera.zoom, this.camera.zoom);

    for (const hex of this.grid.getAllHexes()) {
      this.drawHexagon(hex);
    }

    this.ctx.restore();
  }

  drawHexagon(hex) {
    const { q, r, active, activeEdges } = hex;
    const x = this.hexSize * (1.5 * q);
    const y = this.hexSize * ((Math.sqrt(3) / 2) * q + Math.sqrt(3) * r);

    const corners = [];
    for (let i = 0; i < 6; i++) {
      const angle_deg = 60 * i;
      const angle_rad = (Math.PI / 180) * angle_deg;
      corners.push({
        x: x + this.hexSize * Math.cos(angle_rad),
        y: y + this.hexSize * Math.sin(angle_rad),
      });
    }

    this.ctx.beginPath();
    this.ctx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < 6; i++) {
      this.ctx.lineTo(corners[i].x, corners[i].y);
    }
    this.ctx.closePath();

    if (active) {
      this.ctx.fillStyle = '#fabd2f20'; // Gruvbox yellow transparent
      this.ctx.fill();
    }

    // Draw edges
    for (let i = 0; i < 6; i++) {
      const p1 = corners[i];
      const p2 = corners[(i + 1) % 6];
      this.ctx.beginPath();
      this.ctx.moveTo(p1.x, p1.y);
      this.ctx.lineTo(p2.x, p2.y);

      if (activeEdges[i]) {
        this.ctx.strokeStyle = '#fabd2f'; // Highlight
        this.ctx.lineWidth = 3;
        this.ctx.setLineDash([]);
      } else {
        this.ctx.strokeStyle = '#928374'; // Normal
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([5, 5]);
      }
      this.ctx.stroke();
    }
  }

  screenToWorld(screenX, screenY) {
    const w = this.canvas.width;
    const h = this.canvas.height;

    const x = (screenX - w / 2) / this.camera.zoom - this.camera.x;
    const y = (screenY - h / 2) / this.camera.zoom - this.camera.y;
    return { x, y };
  }

  pixelToHex(x, y) {
    const q = ((2 / 3) * x) / this.hexSize;
    const r = ((-1 / 3) * x + (Math.sqrt(3) / 3) * y) / this.hexSize;
    return this.cubeRound(q, r, -q - r);
  }

  cubeRound(fracQ, fracR, fracS) {
    let q = Math.round(fracQ);
    let r = Math.round(fracR);
    let s = Math.round(fracS);

    const q_diff = Math.abs(q - fracQ);
    const r_diff = Math.abs(r - fracR);
    const s_diff = Math.abs(s - fracS);

    if (q_diff > r_diff && q_diff > s_diff) {
      q = -r - s;
    } else if (r_diff > s_diff) {
      r = -q - s;
    } else {
      s = -q - r;
    }
    return { q, r, s };
  }

  getHit(screenX, screenY) {
    const p = this.screenToWorld(screenX, screenY);
    const hexCoords = this.pixelToHex(p.x, p.y);
    const hex = this.grid.getHex(hexCoords.q, hexCoords.r);

    if (!hex) return null;

    const hx = this.hexSize * (1.5 * hex.q);
    const hy = this.hexSize * ((Math.sqrt(3) / 2) * hex.q + Math.sqrt(3) * hex.r);

    const dx = p.x - hx;
    const dy = p.y - hy;

    // Calculate angle
    let angle = Math.atan2(dy, dx); // -PI to PI
    if (angle < 0) angle += 2 * Math.PI; // 0 to 2PI

    const deg = (angle * 180) / Math.PI;
    const edgeIndex = Math.floor(deg / 60);

    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > this.hexSize * 0.75) {
      return { type: 'edge', target: hex, edgeIndex };
    }

    return { type: 'hex', target: hex };
  }
}
