export var HexState;
(function (HexState) {
    HexState[HexState["UNKNOWN"] = 0] = "UNKNOWN";
    HexState[HexState["INSIDE"] = 1] = "INSIDE";
    HexState[HexState["OUTSIDE"] = 2] = "OUTSIDE";
})(HexState || (HexState = {}));
export var HexColor;
(function (HexColor) {
    HexColor[HexColor["EMPTY"] = 0] = "EMPTY";
    HexColor[HexColor["YELLOW"] = 1] = "YELLOW";
    HexColor[HexColor["PURPLE"] = 2] = "PURPLE";
})(HexColor || (HexColor = {}));
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
export class Grid {
    radius;
    hexagons;
    edgeStates; // Stores only ACTIVE or OFF (user set)
    edgeColors; // Stores color ID (1-6) for ACTIVE edges
    derivedStates; // Stores CALCULATED_OFF
    solutionEdges;
    history;
    historyIndex;
    isDirty;
    constructor() {
        this.radius = -1;
        this.hexagons = new Map();
        this.edgeStates = new Map();
        this.edgeColors = new Map();
        this.derivedStates = new Map();
        this.solutionEdges = new Set();
        this.history = [];
        this.historyIndex = -1;
        this.isDirty = false;
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
            color: HexColor.EMPTY,
        });
    }
    cycleHexColor(hex) {
        if (hex.color === HexColor.EMPTY) {
            let guess = HexColor.YELLOW;
            let foundClue = false;
            // 1. Check Map Edges
            let onMapEdge = false;
            let mapEdgeActive = false;
            let mapEdgeOff = false;
            for (let dir = 0; dir < 6; dir++) {
                const neighbor = this.getNeighbor(hex.q, hex.r, dir);
                if (!neighbor) {
                    onMapEdge = true;
                    const edgeState = this.getEdgeState(hex.q, hex.r, dir);
                    if (edgeState === EdgeState.ACTIVE)
                        mapEdgeActive = true;
                    if (edgeState === EdgeState.OFF || edgeState === EdgeState.CALCULATED_OFF)
                        mapEdgeOff = true;
                }
            }
            if (onMapEdge) {
                if (mapEdgeActive) {
                    guess = HexColor.YELLOW;
                    foundClue = true;
                }
                else if (mapEdgeOff) {
                    guess = HexColor.PURPLE;
                    foundClue = true;
                }
            }
            // 2. Check Neighbors (if no map edge clue found)
            if (!foundClue) {
                for (let dir = 0; dir < 6; dir++) {
                    const neighbor = this.getNeighbor(hex.q, hex.r, dir);
                    if (neighbor && neighbor.color !== HexColor.EMPTY) {
                        const edgeState = this.getEdgeState(hex.q, hex.r, dir);
                        if (edgeState === EdgeState.ACTIVE) {
                            guess = neighbor.color === HexColor.YELLOW ? HexColor.PURPLE : HexColor.YELLOW;
                            foundClue = true;
                            break;
                        }
                        else if (edgeState === EdgeState.OFF || edgeState === EdgeState.CALCULATED_OFF) {
                            guess = neighbor.color;
                            foundClue = true;
                            break;
                        }
                    }
                }
            }
            hex.color = guess;
        }
        else if (hex.color === HexColor.YELLOW) {
            hex.color = HexColor.PURPLE;
        }
        else {
            hex.color = HexColor.EMPTY;
        }
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
        // 1. Check user state first
        const userState = this.edgeStates.get(key);
        if (userState !== undefined && userState !== EdgeState.UNKNOWN) {
            return userState;
        }
        // 2. If dirty, recalculate
        if (this.isDirty) {
            this.recalculateDerivedStates();
        }
        // 3. Return derived state or UNKNOWN
        return this.derivedStates.get(key) || EdgeState.UNKNOWN;
    }
    setEdgeState(q, r, edgeIndex, newState, recordMove = true) {
        // Only allow setting ACTIVE, OFF, or UNKNOWN (clearing).
        // CALCULATED_OFF is read-only logic.
        if (newState === EdgeState.CALCULATED_OFF) {
            return;
        }
        const key = this.getCanonicalEdgeKey(q, r, edgeIndex);
        const existing = this.edgeStates.get(key) || EdgeState.UNKNOWN;
        if (existing === newState && recordMove)
            return;
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
        if (newState === EdgeState.UNKNOWN) {
            this.edgeStates.delete(key);
        }
        else {
            this.edgeStates.set(key, newState);
        }
        this.isDirty = true;
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
        this.edgeStates.clear();
        this.isDirty = true;
        for (let i = 0; i <= index; i++) {
            const move = this.history[i];
            if (move) {
                // Directly set map to avoid overhead, will recalc at end
                const key = this.getCanonicalEdgeKey(move.q, move.r, move.edgeIndex);
                if (move.newState === EdgeState.UNKNOWN) {
                    this.edgeStates.delete(key);
                }
                else {
                    this.edgeStates.set(key, move.newState);
                }
            }
        }
        this.historyIndex = index;
        // this.isDirty is already true
    }
    resetToStart() {
        this.edgeStates.clear();
        this.edgeColors.clear();
        this.derivedStates.clear();
        this.isDirty = false;
        for (const hex of this.hexagons.values()) {
            hex.color = HexColor.EMPTY;
        }
        this.historyIndex = -1;
    }
    get canUndo() {
        return this.historyIndex >= 0;
    }
    get canRedo() {
        return this.historyIndex < this.history.length - 1;
    }
    loadBinaryMap(buffer) {
        this.hexagons.clear();
        this.edgeStates.clear();
        this.edgeColors.clear();
        this.derivedStates.clear();
        this.solutionEdges.clear();
        this.history = [];
        this.historyIndex = -1;
        this.isDirty = false;
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
        // Only check user states against solution
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
    // --- Recalculation Logic ---
    recalculateDerivedStates() {
        this.derivedStates.clear();
        // Algorithm:
        // 1. Identify all "active" edges (from user input).
        // 2. Propagate "forced off" constraints until stability.
        // Constraint: specific to Slitherlink on Hex?
        // "Lines cannot branch". So if a vertex has 2 ACTIVE edges, 3rd must be OFF.
        // "Lines cannot end". If a vertex has 2 OFF edges, 3rd must be OFF? No, depends on loop.
        // Wait, 2 OFF edges means the 3rd CANNOT be ACTIVE (must be OFF). so yes.
        // Basically:
        // - If 2 edges at a vertex are ACTIVE => 3rd is OFF.
        // - If 2 edges at a vertex are OFF => 3rd is OFF.
        // (This covers both "no branching" and "continuity" in a loose way -
        // actually "2 OFF" implies the 3rd cannot be the *single* path to/from that vertex.
        // because degree must be 0 or 2. If 2 are OFF, degree is 0 or 1. If 1 is ACTIVE, bad.
        // So if 2 are OFF, 3rd must be OFF to maintain degree 0.)
        let changed = true;
        while (changed) {
            changed = false;
            // Iterate all vertices.
            // How to iterate vertices?
            // Vertices are uniquely identified by (hex, direction).
            // But vertices are shared. One specific vertex is incident to 3 edges.
            // (hex, vDir), (neighbor1, vDir'), (neighborN, vDir'').
            // We can iterate all hexes, and for each hex iterate its 6 vertices.
            // We can use a Set to track visited vertices to avoid 3x work, but simple iteration is fine for now.
            // Note: getVertexState returns the 3 edges incident to a corner.
            // We can reimplement a simplified version here.
            for (const hex of this.hexagons.values()) {
                for (let i = 0; i < 6; i++) {
                    const cornerIndex = i;
                    // Identify the 3 edges meeting at this vertex
                    // 1. Edge e1: on hex, direction (i+5)%6
                    // 2. Edge e2: on hex, direction i
                    // 3. Edge e3: connecting the two neighbors.
                    const e1Dir = ((cornerIndex + 5) % 6); // "Left" edge
                    const e2Dir = cornerIndex; // "Right" edge
                    // Keys
                    const key1 = this.getCanonicalEdgeKey(hex.q, hex.r, e1Dir);
                    const key2 = this.getCanonicalEdgeKey(hex.q, hex.r, e2Dir);
                    // Neighbors for finding edge 3
                    const n1 = this.getNeighbor(hex.q, hex.r, e1Dir);
                    const n2 = this.getNeighbor(hex.q, hex.r, e2Dir);
                    let key3 = null;
                    if (n1) {
                        // Edge between n1 and n2?
                        // From n1's perspective: it shares e1 with hex.
                        // We need the edge leading to n2.
                        // Direction from n1 to n2.
                        // n1 is at hex+e1Dir. n2 is at hex+e2Dir.
                        // The direction from n1 to n2 corresponds to...
                        // Well, simpler:
                        // e3 is the edge of n1 in direction such that it touches this vertex.
                        // n1's view of this vertex...
                        // n1 is neighbor at (hex.q, hex.r) in direction e1Dir.
                        // The vertex is shared.
                        // Vertex on hex is 'cornerIndex'.
                        // Vertex on n1?
                        // (cornerIndex + 2)? Let's check.
                        // If hex is center, i=0 (East vertex).
                        // e1Dir = NE(5). n1 is NE neighbor.
                        // e2Dir = SE(0). n2 is SE neighbor.
                        // Vertex 0 of Hex touches NE and SE edges.
                        // NE Neighbor needs to look at its SW vertex? No.
                        // NE Neighbor (q+1, r-1).
                        // Edge connecting NE Neighbor and SE Neighbor?
                        // S edge of NE neighbor.
                        // Correct.
                        // So for n1, edge is ((cornerIndex + 1) % 6)?
                        // if corner=0, e1Dir=5 (NE). Dir 5+1 = 6? 0? No.
                        // If n1 is NE(5), edge to SE(0) neighbor is S(1).
                        // (5 + 2) % 6? = 1.
                        // Wait.
                        // let's trust getVertexState logic from before:
                        // "dirN1toN2 = ((cornerIndex + 1) % 6)"
                        const dirN1toN2 = ((cornerIndex + 1) % 6);
                        key3 = this.getCanonicalEdgeKey(n1.q, n1.r, dirN1toN2);
                    }
                    else if (n2) {
                        // Only n2 exists (and hex). This is specific boundary case?
                        // Or n1 empty, n2 exists.
                        // "dirN2toN1 = ((cornerIndex + 4) % 6)"
                        const dirN2toN1 = ((cornerIndex + 4) % 6);
                        key3 = this.getCanonicalEdgeKey(n2.q, n2.r, dirN2toN1);
                    }
                    else {
                        // No neighbors?
                        // Boundary vertex with only 2 edges (e1, e2).
                        key3 = null;
                    }
                    // Resolve states
                    // Helper to get state
                    const getState = (k) => {
                        if (!k)
                            return EdgeState.CALCULATED_OFF; // Virtual edge is OFF
                        // Check user
                        const s = this.edgeStates.get(k);
                        if (s !== undefined && s !== EdgeState.UNKNOWN)
                            return s;
                        // Check derived
                        const d = this.derivedStates.get(k);
                        if (d !== undefined)
                            return d;
                        return EdgeState.UNKNOWN;
                    };
                    const s1 = getState(key1);
                    const s2 = getState(key2);
                    const s3 = getState(key3);
                    const isOff = (s) => s === EdgeState.OFF || s === EdgeState.CALCULATED_OFF;
                    const isActive = (s) => s === EdgeState.ACTIVE;
                    // Propagate
                    const propagate = (targetKey, otherA, otherB) => {
                        if (!targetKey)
                            return;
                        // If target is already determined, skip
                        if (isOff(getState(targetKey)) || isActive(getState(targetKey)))
                            return;
                        let newState = EdgeState.UNKNOWN;
                        if (isActive(otherA) && isActive(otherB)) {
                            newState = EdgeState.CALCULATED_OFF;
                        }
                        else if (isOff(otherA) && isOff(otherB)) {
                            newState = EdgeState.CALCULATED_OFF;
                        }
                        if (newState === EdgeState.CALCULATED_OFF) {
                            if (!this.derivedStates.has(targetKey)) {
                                this.derivedStates.set(targetKey, EdgeState.CALCULATED_OFF);
                                changed = true;
                            }
                        }
                    };
                    propagate(key1, s2, s3);
                    propagate(key2, s1, s3);
                    propagate(key3, s1, s2);
                }
            }
        }
        this.isDirty = false;
    }
    // --- Edge Coloring Logic ---
    getEdgeColor(q, r, dir) {
        const key = this.getCanonicalEdgeKey(q, r, dir);
        return this.edgeColors.get(key) || 0;
    }
    setEdgeColor(q, r, dir, color) {
        const key = this.getCanonicalEdgeKey(q, r, dir);
        if (color === 0) {
            this.edgeColors.delete(key);
        }
        else {
            this.edgeColors.set(key, color);
        }
    }
    // Get all connected ACTIVE edges starting from a given edge
    getConnectedComponent(q, r, dir) {
        const startKey = this.getCanonicalEdgeKey(q, r, dir);
        if (this.edgeStates.get(startKey) !== EdgeState.ACTIVE)
            return [];
        const component = new Set();
        const queue = [startKey];
        component.add(startKey);
        while (queue.length > 0) {
            const currentKey = queue.shift();
            // Parse key back to coords (expensive but robust) or we strictly follow graph.
            // Need to find neighbors of this edge.
            // Ends of the edge.
            // Vertices...
            // Let's use a simpler approach: iterate all connected edges at both vertices of this edge.
            // Reverse key to coords
            const parts = currentKey.split(',').map(Number);
            const hq = parts[0];
            const hr = parts[1];
            const hd = parts[2];
            // 2 vertices for this edge:
            // v1 at corner hd
            // v2 at corner (hd + 1) % 6 ... no?
            // Edge direction D connects corner D and corner (D+1)%6. ROUGHLY.
            // Actually, in point-top hexes (which we seem to use if "N" is dq=0,dr=-1):
            // corner 0 is usually E or SE?
            // Let's rely on neighbors.
            // Neighbors of an edge are edges sharing a vertex.
            // There are 4 potential neighbors (2 at each end).
            const neighbors = this.getEdgeNeighbors(hq, hr, hd);
            for (const nKey of neighbors) {
                if (this.edgeStates.get(nKey) === EdgeState.ACTIVE) {
                    if (!component.has(nKey)) {
                        component.add(nKey);
                        queue.push(nKey);
                    }
                }
            }
        }
        return Array.from(component);
    }
    getEdgeNeighbors(q, r, dir) {
        const neighbors = [];
        // Vertex 1: "Start" of edge. Shared with (dir+5)%6 on same hex.
        const v1_left = ((dir + 5) % 6);
        neighbors.push(this.getCanonicalEdgeKey(q, r, v1_left));
        // The other edges at Vertex 1 might belong to neighbor hexes.
        // Neighbor roughly at dir+4?
        // Easier: getNeighbor(dir+5) -> its edge...
        // Let's reuse Logic from recalculateDerivedStates if possible, or simplified.
        // actually, simpler:
        // A vertex is shared by 3 hexes.
        // At a vertex, there are 3 edges meeting.
        // If one is "dir", the other two are...
        // Vertex A (between dir and dir+5 on this hex):
        // Edges meeting here:
        // 1. (q,r, dir)
        // 2. (q,r, dir-1 aka dir+5)
        // 3. The edge sticking out... which is (neighbor(dir+5), (dir+5)+2 = dir+1??)
        // Let's use the explicit neighbor logic.
        // Vertex 1 (Left end):
        // connected edges:
        // - (q,r, dir+5)
        // - Edge connecting (neighbor(dir)) and (neighbor(dir+5)) ?? No.
        // Let's look at the vertex shared by (q,r) and getNeighbor(dir+5).
        // The edge between them is (q,r, dir+5).
        // Wait, (q,r, dir) is the edge OF q,r in direction dir.
        // It is shared with getNeighbor(dir).
        // Let's define vertices by (Hex, CornerIndex).
        // Edge (q,r, dir) connects Corner(dir) and Corner(dir+1). (Standard numbering)
        // Corner(dir) is shared by:
        // - Hex(q,r)
        // - Neighbor(dir-1)
        // - Neighbor(dir)
        // Edges at Corner(dir):
        // 1. Hex(q,r) edge `dir`
        // 2. Hex(q,r) edge `dir-1`
        // 3. Neighbor(dir-1) edge `dir+1` ?
        // Let's just find all edges sharing endpoints.
        // Vertex 1: Intersection of Hex, N(d-1), N(d).
        // Edges: Hex.d, Hex.d-1, and Edge(N(d-1), N(d)).
        const d_prev = ((dir + 5) % 6);
        const n_prev = this.getNeighbor(q, r, d_prev);
        const n_curr = this.getNeighbor(q, r, dir);
        // 1. Edge on Hex(d-1)
        neighbors.push(this.getCanonicalEdgeKey(q, r, d_prev));
        // 2. Third edge at Vertex 1: Connects N(d-1) and N(d).
        if (n_prev) {
            // If N(d-1) exists, it's Edge(d+1) of N(d-1)
            const edge3Dir = ((d_prev + 2) % 6);
            neighbors.push(this.getCanonicalEdgeKey(n_prev.q, n_prev.r, edge3Dir));
        }
        else if (n_curr) {
            // Fallback: If N(d-1) is missing but N(d) exists.
            // It's Edge(d+4) of N(d).
            const edge3Dir = ((dir + 4) % 6);
            neighbors.push(this.getCanonicalEdgeKey(n_curr.q, n_curr.r, edge3Dir));
        }
        // Vertex 2: Intersection of Hex, N(d), N(d+1).
        // Edges: Hex.d, Hex.d+1, and Edge(N(d), N(d+1)).
        const d_next = ((dir + 1) % 6);
        const n_next = this.getNeighbor(q, r, d_next);
        // 3. Edge on Hex(d+1)
        neighbors.push(this.getCanonicalEdgeKey(q, r, d_next));
        // 4. Third edge at Vertex 2: Connects N(d) and N(d+1).
        if (n_curr) {
            // If N(d) exists, it's Edge(d+2) of N(d)
            const edge4Dir = ((dir + 2) % 6);
            neighbors.push(this.getCanonicalEdgeKey(n_curr.q, n_curr.r, edge4Dir));
        }
        else if (n_next) {
            // Fallback: If N(d) is missing but N(d+1) exists.
            // It's Edge(d+5) of N(d+1).
            const edge4Dir = ((d_next + 4) % 6); // (d+1)+4 = d+5
            neighbors.push(this.getCanonicalEdgeKey(n_next.q, n_next.r, edge4Dir));
        }
        return neighbors;
    }
    pickLeastUsedColor() {
        const counts = [0, 0, 0, 0, 0, 0, 0]; // Index 1-6 used
        for (const c of this.edgeColors.values()) {
            if (c >= 1 && c <= 6) {
                counts[c] = (counts[c] ?? 0) + 1;
            }
        }
        let minCount = Infinity;
        let candidates = [];
        for (let i = 1; i <= 6; i++) {
            const count = counts[i];
            if (count !== undefined) {
                if (count < minCount) {
                    minCount = count;
                    candidates = [i];
                }
                else if (count === minCount) {
                    candidates.push(i);
                }
            }
        }
        // Randomly pick one of the candidates to vary it up
        const picked = candidates[Math.floor(Math.random() * candidates.length)];
        return picked !== undefined ? picked : 1;
    }
    applyColorToComponent(q, r, dir) {
        // If already colored, clear it (toggle logic handled in Input usually, but request said:
        // "if uncolored... apply. If colored... go back to uncolored")
        // This method assumes we want to APPLY.
        const color = this.pickLeastUsedColor();
        const component = this.getConnectedComponent(q, r, dir);
        for (const key of component) {
            this.edgeColors.set(key, color);
        }
    }
    clearColorFromComponent(q, r, dir) {
        const component = this.getConnectedComponent(q, r, dir);
        for (const key of component) {
            this.edgeColors.delete(key);
        }
    }
    handleEdgeChange(q, r, dir, newState) {
        // This is called AFTER the state has been set.
        // 1. If we turned ON an edge, we might merge two colored components?
        // Request didn't specify behavior for merging. Usually we leave them or merge?
        // "If a length of connected edges ... are subsequently split ... keep color ... new segments get new color"
        // Nothing about merging. Let's assume merging keeps colors as is (allowing multi-color chains) or we do nothing.
        // Simpler to do nothing on merge.
        // 2. If we turned OFF an edge, we might have split a colored chain.
        // We need to check if the edge WAS part of a colored chain.
        // But the edge is now OFF, so it has no color (we should clean it up).
        // But we need to know if its neighbors were colored.
        // Problem: The edge is already OFF in `edgeStates`.
        const key = this.getCanonicalEdgeKey(q, r, dir);
        const wasColor = this.edgeColors.get(key);
        // Always remove color from the edge itself if it's OFF
        if (newState !== EdgeState.ACTIVE) {
            this.edgeColors.delete(key);
        }
        // NEW LOGIC: Handle merging/extending
        if (newState === EdgeState.ACTIVE) {
            const neighbors = this.getEdgeNeighbors(q, r, dir);
            // Find unique colors among neighbors
            const neighborColors = new Set();
            for (const nKey of neighbors) {
                if (this.edgeStates.get(nKey) === EdgeState.ACTIVE) {
                    const c = this.edgeColors.get(nKey);
                    if (c !== undefined)
                        neighborColors.add(c);
                }
            }
            if (neighborColors.size > 0) {
                let targetColor = 0;
                if (neighborColors.size === 1) {
                    targetColor = Array.from(neighborColors)[0];
                }
                else {
                    // Multiple colors. We need to decide which one wins.
                    // WINNER: The one with the largest existing component.
                    // To check sizes, we pretend this edge is NOT active yet.
                    // (It shouldn't affect existing components except by joining them)
                    this.edgeStates.delete(key);
                    let maxSize = -1;
                    for (const c of neighborColors) {
                        // Find a neighbor with this color
                        const representativeKey = neighbors.find((k) => this.edgeStates.get(k) === EdgeState.ACTIVE && this.edgeColors.get(k) === c);
                        if (representativeKey) {
                            // Split key to coords
                            const parts = representativeKey.split(',').map(Number);
                            const comp = this.getConnectedComponent(parts[0], parts[1], parts[2]);
                            if (comp.length > maxSize) {
                                maxSize = comp.length;
                                targetColor = c;
                            }
                        }
                    }
                    // Restore edge
                    this.edgeStates.set(key, EdgeState.ACTIVE);
                }
                // Apply to self
                this.edgeColors.set(key, targetColor);
                // Unify component
                const fullComponent = this.getConnectedComponent(q, r, dir);
                for (const compKey of fullComponent) {
                    this.edgeColors.set(compKey, targetColor);
                }
            }
        }
        if (wasColor && newState !== EdgeState.ACTIVE) {
            // It was colored and is now OFF. Potential split.
            // Check its neighbors.
            const neighbors = this.getEdgeNeighbors(q, r, dir);
            const activeNeighbors = neighbors.filter((k) => this.edgeStates.get(k) === EdgeState.ACTIVE && this.edgeColors.get(k) === wasColor);
            // Group neighbors by connectivity (DFS/BFS restricted to `wasColor` edges)
            const groups = [];
            const visited = new Set();
            for (const nKey of activeNeighbors) {
                if (visited.has(nKey))
                    continue;
                // Find component of this neighbor, RESTRICTED to same color
                const group = [];
                const queue = [nKey];
                visited.add(nKey);
                group.push(nKey);
                while (queue.length > 0) {
                    const curr = queue.shift();
                    // Get neighbors of curr
                    // We need to parse curr to get coords...
                    // A helper would be good.
                    const parts = curr.split(',').map(Number);
                    const subNeighbors = this.getEdgeNeighbors(parts[0], parts[1], parts[2]);
                    for (const sKey of subNeighbors) {
                        if (this.edgeStates.get(sKey) === EdgeState.ACTIVE &&
                            this.edgeColors.get(sKey) === wasColor &&
                            !visited.has(sKey)) {
                            visited.add(sKey);
                            group.push(sKey);
                            queue.push(sKey);
                        }
                    }
                }
                groups.push(group);
            }
            // Now we have groups.
            // Behavior: "longer of the two... keep color... new segments get new color"
            // Sort groups by length descending.
            groups.sort((a, b) => b.length - a.length);
            // First group keeps color (already has it).
            // Subsequent groups get new colors.
            for (let i = 1; i < groups.length; i++) {
                const newColor = this.pickLeastUsedColor();
                for (const item of groups[i]) {
                    this.edgeColors.set(item, newColor);
                }
            }
        }
    }
}
