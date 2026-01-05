// Hexagon Region State
export var HexState;
(function (HexState) {
    HexState[HexState["UNKNOWN"] = 0] = "UNKNOWN";
    HexState[HexState["INSIDE"] = 1] = "INSIDE";
    HexState[HexState["OUTSIDE"] = 2] = "OUTSIDE";
})(HexState || (HexState = {}));
// Edge State
export var EdgeState;
(function (EdgeState) {
    EdgeState[EdgeState["UNKNOWN"] = 0] = "UNKNOWN";
    EdgeState[EdgeState["ACTIVE"] = 1] = "ACTIVE";
    EdgeState[EdgeState["OFF"] = 2] = "OFF";
    EdgeState[EdgeState["CALCULATED_OFF"] = 3] = "CALCULATED_OFF";
})(EdgeState || (EdgeState = {}));
export var EdgeDirection;
(function (EdgeDirection) {
    EdgeDirection[EdgeDirection["SE"] = 0] = "SE";
    EdgeDirection[EdgeDirection["S"] = 1] = "S";
    EdgeDirection[EdgeDirection["SW"] = 2] = "SW";
    EdgeDirection[EdgeDirection["NW"] = 3] = "NW";
    EdgeDirection[EdgeDirection["N"] = 4] = "N";
    EdgeDirection[EdgeDirection["NE"] = 5] = "NE";
})(EdgeDirection || (EdgeDirection = {}));
export var VertexDirection;
(function (VertexDirection) {
    VertexDirection[VertexDirection["E"] = 0] = "E";
    VertexDirection[VertexDirection["SE"] = 1] = "SE";
    VertexDirection[VertexDirection["SW"] = 2] = "SW";
    VertexDirection[VertexDirection["W"] = 3] = "W";
    VertexDirection[VertexDirection["NW"] = 4] = "NW";
    VertexDirection[VertexDirection["NE"] = 5] = "NE";
})(VertexDirection || (VertexDirection = {}));
function verticesForEdge(edge) {
    const v1 = edge;
    const v2 = ((edge + 1) % 6);
    return [v1, v2];
}
export class Grid {
    radius;
    hexagons;
    edgeStates;
    solutionEdges;
    history;
    historyIndex; // Points to the last applied move. -1 if no moves.
    constructor() {
        this.radius = -1;
        this.hexagons = new Map();
        this.edgeStates = new Map();
        this.solutionEdges = new Set();
        this.history = [];
        this.historyIndex = -1;
    }
    generateGrid() {
        for (let q = -this.radius; q <= this.radius; q++) {
            const r1 = Math.max(-this.radius, -q - this.radius);
            const r2 = Math.min(this.radius, -q + this.radius);
            for (let r = r1; r <= r2; r++) {
                this.addHex(q, r);
            }
        }
    }
    addHex(q, r) {
        const key = `${q},${r}`;
        this.hexagons.set(key, {
            q,
            r,
            active: HexState.UNKNOWN,
        });
    }
    getHex(q, r) {
        return this.hexagons.get(`${q},${r}`);
    }
    getDirectionVector(direction) {
        const directions = [
            { dq: 1, dr: 0 },
            { dq: 0, dr: 1 },
            { dq: -1, dr: 1 },
            { dq: -1, dr: 0 },
            { dq: 0, dr: -1 },
            { dq: 1, dr: -1 },
        ];
        return directions[direction] || { dq: 0, dr: 0 };
    }
    getNeighbor(q, r, direction) {
        const d = this.getDirectionVector(direction);
        return this.getHex(q + d.dq, r + d.dr);
    }
    getAllHexes() {
        return this.hexagons.values();
    }
    getCanonicalEdgeKey(q, r, dir) {
        const d = this.getDirectionVector(dir);
        const nq = q + d.dq;
        const nr = r + d.dr;
        const ndir = (dir + 3) % 6;
        const k1 = `${q},${r},${dir}`;
        const k2 = `${nq},${nr},${ndir}`;
        return k1 < k2 ? k1 : k2;
    }
    getEdgeState(q, r, dir) {
        const key = this.getCanonicalEdgeKey(q, r, dir);
        return this.edgeStates.get(key) || EdgeState.UNKNOWN;
    }
    setEdgeState(q, r, edgeIndex, newState, recordMove = true) {
        const key = this.getCanonicalEdgeKey(q, r, edgeIndex);
        const existing = this.edgeStates.get(key) || EdgeState.UNKNOWN;
        if (existing === newState && recordMove)
            return;
        // Check if we are loosening a firm constraint, which requires ensuring derived states are re-validated
        const isFirm = (s) => s === EdgeState.ACTIVE || s === EdgeState.OFF;
        const isLoosening = isFirm(existing) && !isFirm(newState);
        // If we're making a new move (not undoing/redoing), clear any future history
        if (recordMove) {
            if (this.historyIndex < this.history.length - 1) {
                this.history = this.history.slice(0, this.historyIndex + 1);
            }
            this.history.push({
                q,
                r,
                edgeIndex,
                oldState: existing,
                newState,
            });
            this.historyIndex++;
        }
        // 1. Identify affected Calculated edges if loosening
        const edgesToReset = [];
        if (isLoosening) {
            this.findConnectedCalculatedEdges(q, r, edgeIndex, edgesToReset);
        }
        // 2. Update the primary edge
        this.edgeStates.set(key, newState);
        // 3. Reset affected calculated edges to UNKNOWN
        for (const edge of edgesToReset) {
            // Record these changes in history too if recording
            const vKey = edge.key;
            const vState = this.edgeStates.get(vKey) || EdgeState.UNKNOWN;
            if (vState !== EdgeState.UNKNOWN) {
                if (recordMove) {
                    this.history.push({
                        q: edge.q,
                        r: edge.r,
                        edgeIndex: edge.dir,
                        oldState: vState,
                        newState: EdgeState.UNKNOWN,
                    });
                    this.historyIndex++;
                }
                this.edgeStates.set(vKey, EdgeState.UNKNOWN);
            }
        }
        // 4. Propagate updates (Check vertices)
        // We check the original edge's vertices AND all reset edges' vertices.
        const verticesToCheck = new Set();
        const addVertices = (q, r, d) => {
            const [v1, v2] = verticesForEdge(d);
            verticesToCheck.add(`${q},${r},${v1}`);
            verticesToCheck.add(`${q},${r},${v2}`);
            // Note: Vertices are shared, but checkVertex uses (hex, corner).
            // The neighboring hex sees the same vertex with a different index.
            // checkVertex iterates around the vertex looking at edges.
            // Does checkVertex handle the "other side" automatically?
            // checkVertex(hex, v) computes logic based on edges around v.
            // It sets edges.
            // So checking from ONE side is sufficient if it covers all 3 edges?
            // Yes, getVertexState gathers s1, s2, s3 (neighbor).
            // So checking (q,r,v1) is enough to cover the vertex logic.
        };
        addVertices(q, r, edgeIndex);
        for (const e of edgesToReset) {
            addVertices(e.q, e.r, e.dir);
        }
        // Also add neighbors of the original edge?
        // If I changed A, neighbors B and C need checking.
        // addVertices adds the vertices of A.
        // The checks at these vertices involves A, B, C. So B and C are checked.
        // Correct.
        // Run checks
        for (const keyStr of verticesToCheck) {
            const parts = keyStr.split(',');
            if (parts.length === 3) {
                const qs = parts[0];
                const rs = parts[1];
                const vs = parts[2];
                if (qs !== undefined && rs !== undefined && vs !== undefined) {
                    const hex = this.getHex(parseInt(qs), parseInt(rs));
                    if (hex) {
                        this.checkVertex(hex, parseInt(vs));
                    }
                }
            }
        }
    }
    findConnectedCalculatedEdges(startQ, startR, startDir, results) {
        // DFS/BFS to find all reachable CALCULATED_OFF edges.
        // We traverse across vertices.
        const visited = new Set();
        // Note: The start edge itself is changing to UNKNOWN (or similar).
        // We want to find *neighbors* that are CALCULATED_OFF.
        const queue = [];
        // Gather initial neighbors (Calculated ones)
        const addNeighbors = (q, r, d) => {
            const activeHex = this.getHex(q, r);
            if (!activeHex)
                return;
            const [v1, v2] = verticesForEdge(d);
            const checkV = (v) => {
                const ctx = this.getVertexState(activeHex, v);
                // Check s1 (e1Index), s2 (e2Index), s3 (neighborContext)
                // We want to add any that are CALCULATED_OFF and not visited.
                const processEdge = (sq, sr, sdir, state) => {
                    if (state === EdgeState.CALCULATED_OFF) {
                        const skey = this.getCanonicalEdgeKey(sq, sr, sdir);
                        if (!visited.has(skey)) {
                            visited.add(skey);
                            const item = { q: sq, r: sr, dir: sdir, key: skey };
                            results.push(item);
                            queue.push(item);
                        }
                    }
                };
                // s1 (e1) - activeHex
                processEdge(activeHex.q, activeHex.r, ctx.e1Index, ctx.s1);
                // s2 (e2) - activeHex
                processEdge(activeHex.q, activeHex.r, ctx.e2Index, ctx.s2);
                // s3 - neighbor
                if (ctx.neighborContext) {
                    processEdge(ctx.neighborContext.hex.q, ctx.neighborContext.hex.r, ctx.neighborContext.edgeIndex, ctx.s3);
                }
            };
            checkV(v1);
            checkV(v2);
        };
        addNeighbors(startQ, startR, startDir);
        // Process queue
        let head = 0;
        while (head < queue.length) {
            const current = queue[head];
            head++;
            if (current) {
                // Recursively add neighbors of this calculated edge
                addNeighbors(current.q, current.r, current.dir);
            }
        }
    }
    undo() {
        if (this.historyIndex < 0)
            return;
        const move = this.history[this.historyIndex];
        if (move) {
            this.setEdgeState(move.q, move.r, move.edgeIndex, move.oldState, false);
            this.historyIndex--;
        }
    }
    redo() {
        if (this.historyIndex >= this.history.length - 1)
            return;
        this.historyIndex++;
        const move = this.history[this.historyIndex];
        if (move) {
            this.setEdgeState(move.q, move.r, move.edgeIndex, move.newState, false);
        }
    }
    loadHistory(history, index) {
        this.history = history;
        this.historyIndex = -1;
        for (let i = 0; i <= index; i++) {
            const move = this.history[i];
            if (move) {
                this.setEdgeState(move.q, move.r, move.edgeIndex, move.newState, false);
            }
            this.historyIndex = i;
        }
    }
    getVertexState(hex, cornerIndex) {
        const e1Index = ((cornerIndex + 5) % 6);
        const s1 = this.getEdgeState(hex.q, hex.r, e1Index);
        const e2Index = cornerIndex;
        const s2 = this.getEdgeState(hex.q, hex.r, e2Index);
        const n1 = this.getNeighbor(hex.q, hex.r, e1Index);
        const n2 = this.getNeighbor(hex.q, hex.r, e2Index);
        const dirN1toN2 = ((cornerIndex + 1) % 6);
        const dirN2toN1 = ((cornerIndex + 4) % 6);
        let s3 = EdgeState.UNKNOWN;
        let neighborContext = null;
        if (n1) {
            s3 = this.getEdgeState(n1.q, n1.r, dirN1toN2);
            neighborContext = { hex: n1, edgeIndex: dirN1toN2 };
        }
        else if (n2) {
            s3 = this.getEdgeState(n2.q, n2.r, dirN2toN1);
            neighborContext = { hex: n2, edgeIndex: dirN2toN1 };
        }
        else {
            s3 = EdgeState.CALCULATED_OFF;
        }
        return {
            s1,
            e1Index,
            s2,
            e2Index,
            s3,
            neighborContext,
            forcesE1: this.forcesOff(s2, s3),
            forcesE2: this.forcesOff(s1, s3),
            forcesS3: this.forcesOff(s1, s2),
        };
    }
    forcesOff(aVal, bVal) {
        if (aVal === EdgeState.ACTIVE && bVal === EdgeState.ACTIVE)
            return true;
        const isInactive = (v) => v === EdgeState.OFF || v === EdgeState.CALCULATED_OFF;
        if (isInactive(aVal) && isInactive(bVal))
            return true;
        return false;
    }
    checkVertex(hex, cornerIndex) {
        const ctx = this.getVertexState(hex, cornerIndex);
        // E1 Logic
        if (ctx.s1 === EdgeState.UNKNOWN && ctx.forcesE1) {
            this.setEdgeState(hex.q, hex.r, ctx.e1Index, EdgeState.CALCULATED_OFF);
        }
        // E2 Logic
        if (ctx.s2 === EdgeState.UNKNOWN && ctx.forcesE2) {
            this.setEdgeState(hex.q, hex.r, ctx.e2Index, EdgeState.CALCULATED_OFF);
        }
        // S3 Logic
        if (ctx.neighborContext) {
            if (ctx.s3 === EdgeState.UNKNOWN && ctx.forcesS3) {
                this.setEdgeState(ctx.neighborContext.hex.q, ctx.neighborContext.hex.r, ctx.neighborContext.edgeIndex, EdgeState.CALCULATED_OFF);
            }
        }
    }
    loadBinaryMap(buffer) {
        this.hexagons.clear();
        this.edgeStates.clear();
        this.solutionEdges.clear();
        this.history = [];
        this.historyIndex = -1;
        const view = new DataView(buffer);
        this.radius = view.getUint8(0);
        let byteIndex = 1;
        for (let q = -this.radius; q <= this.radius; q++) {
            const r1 = Math.max(-this.radius, -q - this.radius);
            const r2 = Math.min(this.radius, -q + this.radius);
            for (let r = r1; r <= r2; r++) {
                const byte = view.getUint8(byteIndex);
                const regionBit = byte & 0x1;
                const active = regionBit === 1 ? HexState.INSIDE : HexState.OUTSIDE;
                const count = (byte >> 1) & 0x7;
                const show = (byte >> 4) & 0x1;
                this.addHex(q, r);
                const hex = this.getHex(q, r);
                hex.active = active;
                hex.targetCount = count;
                hex.showNumber = show === 1;
                byteIndex++;
            }
        }
        this.computeSolution();
    }
    computeSolution() {
        for (const hex of this.hexagons.values()) {
            const myState = hex.active;
            for (let dir = 0; dir < 6; dir++) {
                const neighbor = this.getNeighbor(hex.q, hex.r, dir);
                const nState = neighbor ? neighbor.active : HexState.OUTSIDE;
                if (myState !== nState) {
                    const key = this.getCanonicalEdgeKey(hex.q, hex.r, dir);
                    this.solutionEdges.add(key);
                }
            }
        }
    }
    isSolved() {
        for (const key of this.solutionEdges) {
            if (this.edgeStates.get(key) !== EdgeState.ACTIVE)
                return false;
        }
        for (const [key, state] of this.edgeStates) {
            if (state === EdgeState.ACTIVE) {
                if (!this.solutionEdges.has(key))
                    return false;
            }
        }
        return true;
    }
}
