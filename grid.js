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
            active: 0,
            activeEdges: [0, 0, 0, 0, 0, 0],
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
    checkVertex(hex, cornerIndex) {
        // Identify the three edges meeting at this vertex (Corner i)
        // 1. Edge (i-1) of this hex (previous edge if going clockwise around the hex)
        const e1Index = (cornerIndex + 5) % 6;
        const s1 = hex.activeEdges[e1Index];
        if (s1 === undefined) {
            console.error('Invalid edge state');
            return;
        }
        // 2. Edge i of this hex (current edge/next edge from corner)
        const e2Index = cornerIndex << 0;
        const s2 = hex.activeEdges[e2Index];
        if (s2 === undefined) {
            console.error('Invalid edge state');
            return;
        }
        // 3. The edge connecting the two neighbors
        // Neighbors are in direction of e1 and e2
        const n1 = this.getNeighbor(hex.q, hex.r, e1Index);
        const n2 = this.getNeighbor(hex.q, hex.r, e2Index);
        let s3 = -1; // -1 means invalid/boundary
        let setS3 = null; // function to set s3 if needed
        // Determine direction from N1 to N2 (relative to N1)
        // Formula: (cornerIndex + 1) % 6
        const dirN1toN2 = (cornerIndex + 1) % 6;
        // Determine direction from N2 to N1 (relative to N2)
        // Formula: (cornerIndex + 4) % 6
        const dirN2toN1 = (cornerIndex + 4) % 6;
        /*if (n1 && n2) {
          // If both neighbors exist, s3 is the edge of N1 towards N2
          s3 = n1.activeEdges[dirN1toN2] ?? 0;
          setS3 = (newState: number) => {
            this.setEdgeState(n1.q, n1.r, dirN1toN2, newState);
            this.setEdgeState(n2.q, n2.r, dirN2toN1, newState);
          };
        } else*/ if (n1) {
            // If N1 exists, s3 is the edge of N1 towards N2
            s3 = n1.activeEdges[dirN1toN2] ?? 0;
            setS3 = (newState) => {
                this.setEdgeState(n1.q, n1.r, dirN1toN2, newState);
            };
        }
        else if (n2) {
            // If N1 is missing but N2 exists, s3 is the edge of N2 towards N1
            s3 = n2.activeEdges[dirN2toN1] ?? 0;
            setS3 = (newState) => {
                this.setEdgeState(n2.q, n2.r, dirN2toN1, newState);
            };
        }
        // If neither exists, s3 remains -1, effectively treated as "Calculated Off" below.
        // Logic:
        // If exactly 2 edges are Active (1) -> 3rd (if Neutral 0) becomes Calculated Off (3)
        // If exactly 2 edges are Inactive (2 or 3) -> 3rd (if Neutral 0) becomes Calculated Off (3)
        // Treat boundary edges (phantom edges) as 'Calculated Off' (3)
        let effectiveS3 = s3;
        if (effectiveS3 === -1) {
            effectiveS3 = 3;
        }
        const forcesOff = (a, b) => {
            const aActive = a === 1;
            const bActive = b === 1;
            const aInactive = a === 2 || a === 3;
            const bInactive = b === 2 || b === 3;
            return (aActive && bActive) || (aInactive && bInactive);
        };
        // Check s1
        if (s1 === 0 && forcesOff(s2, effectiveS3)) {
            this.setEdgeState(hex.q, hex.r, e1Index, 3);
        }
        else if (s1 === 3 && !forcesOff(s2, effectiveS3)) {
            this.setEdgeState(hex.q, hex.r, e1Index, 0);
        }
        // Check s2
        if (s2 === 0 && forcesOff(s1, effectiveS3)) {
            this.setEdgeState(hex.q, hex.r, e2Index, 3);
        }
        else if (s2 === 3 && !forcesOff(s1, effectiveS3)) {
            this.setEdgeState(hex.q, hex.r, e2Index, 0);
        }
        // Check s3
        if (setS3) {
            if (s3 === 0 && forcesOff(s1, s2)) {
                setS3(3);
            }
            else if (s3 === 3 && !forcesOff(s1, s2)) {
                setS3(0);
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
                const active = regionBit === 1 ? 1 : 2;
                const count = (byte >> 1) & 0x7;
                const show = (byte >> 4) & 0x1;
                const key = `${q},${r}`;
                this.hexagons.set(key, {
                    q,
                    r,
                    active,
                    targetCount: count,
                    showNumber: show === 1,
                    activeEdges: [0, 0, 0, 0, 0, 0], // Initialize to Neutral (0)
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
