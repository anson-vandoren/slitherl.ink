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
    constructor() {
        this.radius = -1;
        this.hexagons = new Map();
        this.edgeStates = new Map();
        this.solutionEdges = new Set();
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
    setEdgeState(q, r, edgeIndex, newState) {
        const key = this.getCanonicalEdgeKey(q, r, edgeIndex);
        const existing = this.edgeStates.get(key) || EdgeState.UNKNOWN;
        if (existing === newState)
            return;
        this.edgeStates.set(key, newState);
        const [v1, v2] = verticesForEdge(edgeIndex);
        const hex = this.getHex(q, r);
        if (hex) {
            this.checkVertex(hex, v1);
            this.checkVertex(hex, v2);
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
        const forcesOff = (aVal, bVal) => {
            if (aVal === EdgeState.ACTIVE && bVal === EdgeState.ACTIVE)
                return true;
            const isInactive = (v) => v === EdgeState.OFF || v === EdgeState.CALCULATED_OFF;
            if (isInactive(aVal) && isInactive(bVal))
                return true;
            return false;
        };
        return {
            s1,
            e1Index,
            s2,
            e2Index,
            s3,
            neighborContext,
            forcesE1: forcesOff(s2, s3),
            forcesE2: forcesOff(s1, s3),
            forcesS3: forcesOff(s1, s2),
        };
    }
    checkVertex(hex, cornerIndex) {
        let ctx = this.getVertexState(hex, cornerIndex);
        if (ctx.s1 === EdgeState.UNKNOWN && ctx.forcesE1) {
            this.setEdgeState(hex.q, hex.r, ctx.e1Index, EdgeState.CALCULATED_OFF);
            ctx = this.getVertexState(hex, cornerIndex);
        }
        if (ctx.s2 === EdgeState.UNKNOWN && ctx.forcesE2) {
            this.setEdgeState(hex.q, hex.r, ctx.e2Index, EdgeState.CALCULATED_OFF);
            ctx = this.getVertexState(hex, cornerIndex);
        }
        if (ctx.s3 === EdgeState.UNKNOWN && ctx.forcesS3 && ctx.neighborContext) {
            this.setEdgeState(ctx.neighborContext.hex.q, ctx.neighborContext.hex.r, ctx.neighborContext.edgeIndex, EdgeState.CALCULATED_OFF);
        }
    }
    loadBinaryMap(buffer) {
        this.hexagons.clear();
        this.edgeStates.clear();
        this.solutionEdges.clear();
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
