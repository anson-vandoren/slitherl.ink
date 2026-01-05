const COLORS = {
    bg0_hard: '#1d2021',
    bg0: '#282828',
    bg0_soft: '#32302f',
    bg1: '#3c3836',
    bg2: '#504945',
    bg3: '#665c54',
    bg4: '#7c6f64',
    fg0: '#fbf1c7',
    fg1: '#ebdbb2',
    fg2: '#d5c4a1',
    fg3: '#bdae93',
    fg4: '#a89984',
    red: '#cc241d',
    green: '#98971a',
    yellow: '#d79921',
    blue: '#458588',
    purple: '#b16286',
    aqua: '#689d6a',
    orange: '#d65d0e',
    gray: '#928374',
    red_bright: '#fb4934',
    green_bright: '#b8bb26',
    yellow_bright: '#fabd2f',
    blue_bright: '#83a598',
    purple_bright: '#d3869b',
    aqua_bright: '#8ec07c',
    orange_bright: '#fe8019',
    gray_bright: '#a89984',
};
export class Renderer {
    grid;
    camera;
    hexSize;
    constructor(grid, camera) {
        this.grid = grid;
        this.camera = camera;
        this.hexSize = 30; // Base size of hexagon
    }
    render(canvas) {
        let ctx = canvas.getContext('2d', { alpha: false });
        ctx.fillStyle = COLORS.bg0_hard;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = COLORS.gray;
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.save();
        // Center the camera
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.scale(this.camera.zoom, this.camera.zoom);
        ctx.translate(this.camera.x, this.camera.y);
        const intersections = new Map(); // Key: "x,y", Value: {x, y}
        // Layer 1: Inactive Edges (State 2 or 3)
        for (const hex of this.grid.getAllHexes()) {
            const corners = this.getHexCorners(hex);
            this.drawHexEdges(ctx, hex, corners, 'inactive');
        }
        // Layer 2: Neutral Edges (State 0)
        for (const hex of this.grid.getAllHexes()) {
            const corners = this.getHexCorners(hex);
            this.drawHexEdges(ctx, hex, corners, 'neutral');
        }
        // Layer 3: Numbers (instead of Fills)
        for (const hex of this.grid.getAllHexes()) {
            this.drawHexNumber(ctx, hex);
        }
        // Layer 4: Active Edges (State 1)
        for (const hex of this.grid.getAllHexes()) {
            const corners = this.getHexCorners(hex);
            this.drawHexEdges(ctx, hex, corners, 'active');
            // Collect corners for intersection rendering (only need to do this once)
            for (const p of corners) {
                const k = `${Math.round(p.x * 100)},${Math.round(p.y * 100)}`;
                if (!intersections.has(k)) {
                    intersections.set(k, p);
                }
            }
        }
        // Draw intersections
        ctx.fillStyle = COLORS.fg2;
        for (const p of intersections.values()) {
            ctx.beginPath();
            // Radius 2 looks good for standard zoom
            ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }
    getHexCorners(hex) {
        const { q, r } = hex;
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
        return corners;
    }
    drawHexFill(ctx, hex, corners) {
        if (!corners)
            corners = this.getHexCorners(hex);
        const { active } = hex;
        ctx.beginPath();
        ctx.moveTo(corners[0].x, corners[0].y);
        for (let i = 1; i < 6; i++) {
            ctx.lineTo(corners[i].x, corners[i].y);
        }
        ctx.closePath();
        if (active === 1) {
            ctx.fillStyle = COLORS.yellow_bright + '80';
            ctx.fill();
        }
        else if (active === 2) {
            ctx.fillStyle = COLORS.purple + '80';
            ctx.fill();
        }
    }
    drawHexEdges(ctx, hex, corners, layerType) {
        if (!corners)
            corners = this.getHexCorners(hex);
        const { activeEdges } = hex;
        for (let i = 0; i < 6; i++) {
            const neighbor = this.grid.getNeighbor(hex.q, hex.r, i);
            // Canonical Edge Rule:
            // If neighbor exists, draw ONLY if we are the "lesser" hex.
            // If neighbor does NOT exist, we always draw.
            let shouldDraw = true;
            if (neighbor) {
                if (neighbor.q < hex.q)
                    shouldDraw = false;
                else if (neighbor.q === hex.q && neighbor.r < hex.r)
                    shouldDraw = false;
            }
            if (!shouldDraw)
                continue;
            const state = activeEdges[i];
            let matchesLayer = false;
            if (layerType === 'inactive' && (state === 2 || state === 3))
                matchesLayer = true;
            else if (layerType === 'neutral' && state === 0)
                matchesLayer = true;
            else if (layerType === 'active' && state === 1)
                matchesLayer = true;
            if (!matchesLayer)
                continue;
            const p1 = corners[i];
            const p2 = corners[(i + 1) % 6];
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            if (state === 0) {
                // Neutral (0)
                ctx.strokeStyle = COLORS.gray;
                ctx.lineWidth = 1;
                ctx.setLineDash([1, 3]);
                ctx.lineCap = 'butt';
                ctx.lineJoin = 'miter';
                ctx.stroke();
            }
            else if (state === 1) {
                // Active (1)
                ctx.strokeStyle = COLORS.fg2;
                ctx.lineWidth = 3;
                ctx.setLineDash([]);
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.stroke();
            }
            else if (state === 2 || state === 3) {
                // Inactive (2 or 3)
                ctx.strokeStyle = COLORS.bg0_soft;
                ctx.lineWidth = 1;
                ctx.setLineDash([1, 3]);
                ctx.lineCap = 'butt';
                ctx.lineJoin = 'miter';
                ctx.stroke();
                if (state === 2) {
                    // Check visibility condition for X
                    // Condition: If hex.active > 0 OR (neighbor && neighbor.active > 0), SKIP X
                    let hideX = false;
                    if (hex.active > 0)
                        hideX = true;
                    if (neighbor && neighbor.active > 0)
                        hideX = true;
                    if (!hideX) {
                        const midX = (p1.x + p2.x) / 2;
                        const midY = (p1.y + p2.y) / 2;
                        const s = 4;
                        ctx.beginPath();
                        ctx.moveTo(midX - s, midY - s);
                        ctx.lineTo(midX + s, midY + s);
                        ctx.moveTo(midX + s, midY - s);
                        ctx.lineTo(midX - s, midY + s);
                        ctx.setLineDash([]);
                        ctx.stroke();
                    }
                }
            }
        }
    }
    drawHexNumber(ctx, hex) {
        if (!hex.showNumber)
            return;
        const { q, r } = hex;
        const x = this.hexSize * (1.5 * q);
        const y = this.hexSize * ((Math.sqrt(3) / 2) * q + Math.sqrt(3) * r);
        ctx.fillStyle = COLORS.fg0;
        ctx.font = '20px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(hex.targetCount?.toString() ?? '', x, y);
    }
    screenToWorld(canvas, screenX, screenY) {
        const w = canvas.width;
        const h = canvas.height;
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
        }
        else if (r_diff > s_diff) {
            r = -q - s;
        }
        else {
            s = -q - r;
        }
        return { q, r, s };
    }
    getHit(canvas, screenX, screenY) {
        const p = this.screenToWorld(canvas, screenX, screenY);
        const hexCoords = this.pixelToHex(p.x, p.y);
        const hex = this.grid.getHex(hexCoords.q, hexCoords.r);
        // Calculate geometry relative to the theoretical hex center
        const hx = this.hexSize * (1.5 * hexCoords.q);
        const hy = this.hexSize * ((Math.sqrt(3) / 2) * hexCoords.q + Math.sqrt(3) * hexCoords.r);
        const dx = p.x - hx;
        const dy = p.y - hy;
        // Calculate angle
        let angle = Math.atan2(dy, dx); // -PI to PI
        if (angle < 0)
            angle += 2 * Math.PI; // 0 to 2PI
        const deg = (angle * 180) / Math.PI;
        const edgeIndex = Math.floor(deg / 60);
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (hex) {
            if (dist > this.hexSize * 0.6) {
                return { type: 'edge', target: hex, edgeIndex };
            }
            return { type: 'hex', target: hex };
        }
        else {
            // If no hex found, but we are in the "edge zone" (outer ring of a phantom hex),
            // we might be clicking the shared edge of a valid neighbor.
            if (dist > this.hexSize * 0.6) {
                const neighbor = this.grid.getNeighbor(hexCoords.q, hexCoords.r, edgeIndex);
                if (neighbor) {
                    // The shared edge on the neighbor is opposite to our local edgeIndex
                    const neighborEdgeIndex = (edgeIndex + 3) % 6;
                    return { type: 'edge', target: neighbor, edgeIndex: neighborEdgeIndex };
                }
            }
        }
        return null;
    }
    getGridBounds() {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        // We can iterate all hexes to find precise bounds
        // Optimization: for a perfect hex grid, we could calculate analytical bounds,
        // but iterating is robust for arbitrary shapes if we change grid gen later.
        let count = 0;
        for (const hex of this.grid.getAllHexes()) {
            count++;
            const x = this.hexSize * (1.5 * hex.q);
            const y = this.hexSize * ((Math.sqrt(3) / 2) * hex.q + Math.sqrt(3) * hex.r);
            // Check all 6 corners for precise AABB?
            // Or just center + radius?
            // Center + radius is good enough approximation, or just center +/- hexSize is safe.
            // Let's use the center coordinate which is the anchor.
            // To strictly contain the visual drawing, we should add/subtract hexSize.
            minX = Math.min(minX, x - this.hexSize);
            maxX = Math.max(maxX, x + this.hexSize);
            minY = Math.min(minY, y - this.hexSize);
            maxY = Math.max(maxY, y + this.hexSize);
        }
        if (count === 0)
            return { minX: -100, maxX: 100, minY: -100, maxY: 100, width: 200, height: 200 }; // Fallback
        return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
    }
}
