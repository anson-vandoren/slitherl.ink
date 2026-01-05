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
    derivedStates; // Stores CALCULATED_OFF
    solutionEdges;
    history;
    historyIndex;
    isDirty;
    constructor() {
        this.radius = -1;
        this.hexagons = new Map();
        this.edgeStates = new Map();
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
}
