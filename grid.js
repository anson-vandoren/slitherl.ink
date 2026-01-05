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
var EdgeDirection;
(function (EdgeDirection) {
    EdgeDirection[EdgeDirection["SE"] = 0] = "SE";
    EdgeDirection[EdgeDirection["S"] = 1] = "S";
    EdgeDirection[EdgeDirection["SW"] = 2] = "SW";
    EdgeDirection[EdgeDirection["NW"] = 3] = "NW";
    EdgeDirection[EdgeDirection["N"] = 4] = "N";
    EdgeDirection[EdgeDirection["NE"] = 5] = "NE";
})(EdgeDirection || (EdgeDirection = {}));
var VertexDirection;
(function (VertexDirection) {
    VertexDirection[VertexDirection["E"] = 0] = "E";
    VertexDirection[VertexDirection["SE"] = 1] = "SE";
    VertexDirection[VertexDirection["SW"] = 2] = "SW";
    VertexDirection[VertexDirection["W"] = 3] = "W";
    VertexDirection[VertexDirection["NW"] = 4] = "NW";
    VertexDirection[VertexDirection["NE"] = 5] = "NE";
})(VertexDirection || (VertexDirection = {}));
function verticesForEdge(edge) {
    // TODO: this is basically [VertexDirection.edge, VertexDirection.((edge + 1) % 6)];
    // But that's ugly to express in TypeScript
    switch (edge) {
        case EdgeDirection.SE:
            return [VertexDirection.E, VertexDirection.SE];
        case EdgeDirection.S:
            return [VertexDirection.SE, VertexDirection.SW];
        case EdgeDirection.SW:
            return [VertexDirection.SW, VertexDirection.W];
        case EdgeDirection.NW:
            return [VertexDirection.W, VertexDirection.NW];
        case EdgeDirection.N:
            return [VertexDirection.NW, VertexDirection.NE];
        case EdgeDirection.NE:
            return [VertexDirection.NE, VertexDirection.E];
    }
}
export class Grid {
    radius;
    hexagons;
    constructor(radius) {
        this.radius = radius;
        this.hexagons = new Map();
        this.generateGrid();
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
            activeEdges: [
                EdgeState.UNKNOWN,
                EdgeState.UNKNOWN,
                EdgeState.UNKNOWN,
                EdgeState.UNKNOWN,
                EdgeState.UNKNOWN,
                EdgeState.UNKNOWN,
            ],
        });
    }
    /**
     * Get hex by q and r coordinates
     */
    getHex(q, r) {
        return this.hexagons.get(`${q},${r}`);
    }
    /**
     * Get neighbor hex by q and r coordinates and direction
     */
    getNeighbor(q, r, direction) {
        const directions = [
            { dq: 1, dr: 0 }, // 0
            { dq: 0, dr: 1 }, // 1
            { dq: -1, dr: 1 }, // 2
            { dq: -1, dr: 0 }, // 3
            { dq: 0, dr: -1 }, // 4
            { dq: 1, dr: -1 }, // 5
        ];
        const d = directions[direction];
        if (!d)
            return undefined;
        return this.getHex(q + d.dq, r + d.dr);
    }
    getAllHexes() {
        return this.hexagons.values();
    }
    setEdgeState(q, r, edgeIndex, newState) {
        const hex = this.getHex(q, r);
        if (!hex)
            return;
        if (hex.activeEdges[edgeIndex] === newState)
            return;
        hex.activeEdges[edgeIndex] = newState;
        // Sync neighbor
        const neighbor = this.getNeighbor(q, r, edgeIndex);
        if (neighbor) {
            const neighborEdgeIndex = (edgeIndex + 3) % 6;
            neighbor.activeEdges[neighborEdgeIndex] = newState;
        }
        // Check vertices at both ends of this edge
        // Edge i connects Corner i and Corner i+1 (mod 6)
        let [v1, v2] = verticesForEdge(edgeIndex);
        this.checkVertex(hex, v1);
        this.checkVertex(hex, v2);
    }
    /**
     * Returns the state of edges around a vertex, and whether this vertex forces any edge off.
     */
    /**
     * Returns the state of edges around a vertex, and whether this vertex forces any edge off.
     */
    /**
     * Checks if a Calculated Off (3) edge is grounded (connected to a 2 or Boundary).
     * Used to prevent cycles of 3s.
     */
    isGrounded(hex, edgeIndex, visited = new Set()) {
        const val = hex.activeEdges[edgeIndex];
        if (val === EdgeState.OFF)
            return true; // Intentional Off is ground
        if (val !== EdgeState.CALCULATED_OFF)
            return false; // 0 or 1 is not Off
        // Identify edge canonically
        // Use smaller coordinate hex to identify edge?
        // Or just store "q,r,edgeIndex"
        const edgeId = `${hex.q},${hex.r},${edgeIndex}`;
        if (visited.has(edgeId))
            return false; // Cycle detected
        visited.add(edgeId);
        // Check both vertices of this edge.
        // If EITHER vertex forces this edge to be off (with grounded inputs), then this edge is grounded.
        const [v1, v2] = verticesForEdge(edgeIndex);
        const checkVertexForce = (corner) => {
            // Logic similar to getVertexState but we only care about INPUTS to this edge.
            // This edge is E_target.
            // At this corner, we have 2 other edges: E_other and E_neighbor.
            // We need forcesOff(E_other, E_neighbor).
            // AND those inputs must be grounded.
            // 1. Identify E_other and E_neighbor
            // E_target is either e1Index or e2Index relative to corner.
            const e1Index = ((corner + 5) % 6);
            const e2Index = corner;
            let otherVal, otherIdx;
            let neighborIdx = null;
            let neighborHex = null;
            // Neighbor stuff
            const dirN1toN2 = ((corner + 1) % 6);
            const dirN2toN1 = ((corner + 4) % 6);
            const n1 = this.getNeighbor(hex.q, hex.r, e1Index);
            const n2 = this.getNeighbor(hex.q, hex.r, e2Index);
            let s3 = -1;
            if (n1) {
                s3 = n1.activeEdges[dirN1toN2] ?? EdgeState.UNKNOWN;
                neighborHex = n1;
                neighborIdx = dirN1toN2;
            }
            else if (n2) {
                s3 = n2.activeEdges[dirN2toN1] ?? EdgeState.UNKNOWN;
                neighborHex = n2;
                neighborIdx = dirN2toN1;
            }
            // Determine which is active edge and which is other
            if (e1Index === edgeIndex) {
                // Active is s1. Other is s2.
                otherVal = hex.activeEdges[e2Index];
                otherIdx = e2Index;
            }
            else {
                // Active is s2. Other is s1.
                otherVal = hex.activeEdges[e1Index];
                otherIdx = e1Index;
            }
            let effS3 = s3 === -1 ? EdgeState.CALCULATED_OFF : s3;
            // Logic forcesOff(other, neighbor)
            // Check if valid "Off" force exists
            const otherActive = otherVal === EdgeState.ACTIVE;
            const neighborActive = effS3 === EdgeState.ACTIVE;
            if (otherActive && neighborActive)
                return true; // 1 and 1 is a solid ground (Active constraints)
            // Inactive case
            const otherInactive = otherVal === EdgeState.OFF || otherVal === EdgeState.CALCULATED_OFF;
            const neighborInactive = effS3 === EdgeState.OFF || effS3 === EdgeState.CALCULATED_OFF;
            if (otherInactive && neighborInactive) {
                // Recursively check grounding
                // For 'other' (local edge):
                const otherGrounded = this.isGrounded(hex, otherIdx, visited);
                // For 'neighbor' (s3):
                let neighborGrounded = false;
                if (effS3 === EdgeState.CALCULATED_OFF) {
                    if (s3 === -1)
                        neighborGrounded = true; // Boundary is grounded
                    else if (neighborHex && neighborIdx !== null) {
                        neighborGrounded = this.isGrounded(neighborHex, neighborIdx, visited);
                    }
                }
                else if (effS3 === EdgeState.OFF) {
                    neighborGrounded = true;
                }
                return otherGrounded && neighborGrounded;
            }
            return false;
        };
        return checkVertexForce(v1) || checkVertexForce(v2);
    }
    /**
     * Returns the state of edges around a vertex, and whether this vertex forces any edge off.
     */
    getVertexState(hex, cornerIndex) {
        // 1. Edge (i-1) of this hex
        const e1Index = ((cornerIndex + 5) % 6);
        const s1 = hex.activeEdges[e1Index]; // Assumes valid activeEdges
        // 2. Edge i of this hex
        const e2Index = cornerIndex;
        const s2 = hex.activeEdges[e2Index];
        // 3. The edge connecting the two neighbors
        // Neighbors are in direction of e1 and e2
        const n1 = this.getNeighbor(hex.q, hex.r, e1Index);
        const n2 = this.getNeighbor(hex.q, hex.r, e2Index);
        const dirN1toN2 = ((cornerIndex + 1) % 6);
        const dirN2toN1 = ((cornerIndex + 4) % 6);
        let s3 = -1;
        let neighborContext = null;
        if (n1) {
            s3 = n1.activeEdges[dirN1toN2] ?? EdgeState.UNKNOWN;
            neighborContext = { hex: n1, edgeIndex: dirN1toN2 };
        }
        else if (n2) {
            s3 = n2.activeEdges[dirN2toN1] ?? EdgeState.UNKNOWN;
            neighborContext = { hex: n2, edgeIndex: dirN2toN1 };
        }
        let effectiveS3 = s3 === -1 ? EdgeState.CALCULATED_OFF : s3;
        // ForcesOff now checks grounding for 3s
        const forcesOff = (aVal, aHex, aIdx, bVal, bHex, bIdx) => {
            const aActive = aVal === EdgeState.ACTIVE;
            const bActive = bVal === EdgeState.ACTIVE;
            if (aActive && bActive)
                return true;
            const isInactive = (val, h, idx) => {
                if (val === EdgeState.OFF)
                    return true;
                if (val === EdgeState.CALCULATED_OFF) {
                    if (h && idx !== null)
                        return this.isGrounded(h, idx);
                    return true; // Boundary or unknown (assume grounded if no context, i.e. boundary)
                }
                return false;
            };
            const aInactive = isInactive(aVal, aHex, aIdx);
            const bInactive = isInactive(bVal, bHex, bIdx);
            return aInactive && bInactive;
        };
        return {
            s1,
            e1Index,
            forcesE1: forcesOff(s2, hex, e2Index, effectiveS3, neighborContext?.hex ?? null, neighborContext?.edgeIndex ?? null),
            s2,
            e2Index,
            forcesE2: forcesOff(s1, hex, e1Index, effectiveS3, neighborContext?.hex ?? null, neighborContext?.edgeIndex ?? null),
            s3,
            neighborContext,
            forcesS3: forcesOff(s1, hex, e1Index, s2, hex, e2Index),
        };
    }
    checkVertex(hex, cornerIndex) {
        let ctx = this.getVertexState(hex, cornerIndex);
        const otherEndForcesOff = (h, edgeIdx, currentCorner) => {
            const [v1, v2] = verticesForEdge(edgeIdx);
            const otherCorner = v1 === currentCorner ? v2 : v1;
            const otherCtx = this.getVertexState(h, otherCorner);
            if (otherCtx.e1Index === edgeIdx)
                return otherCtx.forcesE1;
            if (otherCtx.e2Index === edgeIdx)
                return otherCtx.forcesE2;
            return false;
        };
        // Check s1 (e1Index)
        if (ctx.s1 === EdgeState.UNKNOWN && ctx.forcesE1) {
            this.setEdgeState(hex.q, hex.r, ctx.e1Index, EdgeState.CALCULATED_OFF);
            ctx = this.getVertexState(hex, cornerIndex);
        }
        else if (ctx.s1 === EdgeState.CALCULATED_OFF && !ctx.forcesE1) {
            if (!otherEndForcesOff(hex, ctx.e1Index, cornerIndex)) {
                this.setEdgeState(hex.q, hex.r, ctx.e1Index, EdgeState.UNKNOWN);
                ctx = this.getVertexState(hex, cornerIndex);
            }
        }
        // Check s2 (e2Index)
        if (ctx.s2 === EdgeState.UNKNOWN && ctx.forcesE2) {
            this.setEdgeState(hex.q, hex.r, ctx.e2Index, EdgeState.CALCULATED_OFF);
            ctx = this.getVertexState(hex, cornerIndex);
        }
        else if (ctx.s2 === EdgeState.CALCULATED_OFF && !ctx.forcesE2) {
            if (!otherEndForcesOff(hex, ctx.e2Index, cornerIndex)) {
                this.setEdgeState(hex.q, hex.r, ctx.e2Index, EdgeState.UNKNOWN);
                ctx = this.getVertexState(hex, cornerIndex);
            }
        }
        // Check s3
        if (ctx.neighborContext) {
            if (ctx.s3 === EdgeState.UNKNOWN && ctx.forcesS3) {
                this.setEdgeState(ctx.neighborContext.hex.q, ctx.neighborContext.hex.r, ctx.neighborContext.edgeIndex, EdgeState.CALCULATED_OFF);
                ctx = this.getVertexState(hex, cornerIndex);
            }
            else if (ctx.s3 === EdgeState.CALCULATED_OFF && !ctx.forcesS3) {
                const [v1, v2] = verticesForEdge(ctx.neighborContext.edgeIndex);
                const startForcing = this.getVertexState(ctx.neighborContext.hex, v1);
                const endForcing = this.getVertexState(ctx.neighborContext.hex, v2);
                const v1Forces = (startForcing.e1Index === ctx.neighborContext.edgeIndex && startForcing.forcesE1) ||
                    (startForcing.e2Index === ctx.neighborContext.edgeIndex && startForcing.forcesE2);
                const v2Forces = (endForcing.e1Index === ctx.neighborContext.edgeIndex && endForcing.forcesE1) ||
                    (endForcing.e2Index === ctx.neighborContext.edgeIndex && endForcing.forcesE2);
                if (!v1Forces && !v2Forces) {
                    this.setEdgeState(ctx.neighborContext.hex.q, ctx.neighborContext.hex.r, ctx.neighborContext.edgeIndex, EdgeState.UNKNOWN);
                    ctx = this.getVertexState(hex, cornerIndex);
                }
            }
        }
    }
    loadMap(mapData) {
        this.hexagons.clear();
        this.radius = mapData.radius;
        // Load hexes with their Region state (1=Inside, 2=Outside)
        for (const h of mapData.hexes) {
            const key = `${h.q},${h.r}`;
            this.hexagons.set(key, {
                q: h.q,
                r: h.r,
                active: h.active, // This is the Region state
                activeEdges: [0, 0, 0, 0, 0, 0],
            });
        }
        this.deriveEdgesFromRegions();
    }
    loadBinaryMap(buffer) {
        this.hexagons.clear();
        const view = new DataView(buffer);
        this.radius = view.getUint8(0);
        let byteIndex = 1;
        // Iterate in the same canonical order
        for (let q = -this.radius; q <= this.radius; q++) {
            const r1 = Math.max(-this.radius, -q - this.radius);
            const r2 = Math.min(this.radius, -q + this.radius);
            for (let r = r1; r <= r2; r++) {
                const byte = view.getUint8(byteIndex);
                // Unpack byte
                // Bit 0: Region (1=Inside, 0=Outside) (Note: original generator code used 1=Inside, 2=Outside,
                // but the binary saves 1 for Inside, 0 for Outside. I should map this back to 1 and 2 for consistency if needed,
                // or just use 1 and 2. The generator saves bit as (active===1 ? 1 : 0).
                // So bit 1 means Inside (state 1), bit 0 means Outside (state 2).
                const regionBit = byte & 0x1;
                const active = regionBit === 1 ? HexState.INSIDE : HexState.OUTSIDE;
                const count = (byte >> 1) & 0x7;
                const show = (byte >> 4) & 0x1;
                const key = `${q},${r}`;
                this.hexagons.set(key, {
                    q,
                    r,
                    active,
                    targetCount: count,
                    showNumber: show === 1,
                    activeEdges: [
                        EdgeState.UNKNOWN,
                        EdgeState.UNKNOWN,
                        EdgeState.UNKNOWN,
                        EdgeState.UNKNOWN,
                        EdgeState.UNKNOWN,
                        EdgeState.UNKNOWN,
                    ], // Initialize to Neutral (0)
                });
                byteIndex++;
            }
        }
        // No longer calling deriveEdgesFromRegions(), starting with neutral board.
    }
    deriveEdgesFromRegions() {
        // Deprecated for Puzzle Mode.
        // Kept empty/minimal or just removed.
        // If I leave it, I should make sure it's not called or doesn't do anything disruptive.
        // The previous implementation overwrote activeEdges.
        // I entered this method in the replacement range, so I will effectively remove the old logic.
        // For now, I'll just leave it empty or remove it.
        // The plan said "Remove deriveEdgesFromRegions call on load".
        // I will remove the method entirely if I can cover the whole range.
    }
}
