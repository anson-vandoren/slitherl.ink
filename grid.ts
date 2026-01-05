// Hexagon Region State
export enum HexState {
  UNKNOWN = 0,
  INSIDE = 1,
  OUTSIDE = 2,
}

// Edge State
export enum EdgeState {
  UNKNOWN = 0,
  ACTIVE = 1,
  OFF = 2,
  CALCULATED_OFF = 3,
}

export interface Hex {
  q: number;
  r: number;
  active: HexState;
  targetCount?: number;
  showNumber?: boolean;
}

export enum EdgeDirection {
  SE = 0, // dq=1, dr=0
  S = 1, // dq=0, dr=1
  SW = 2, // dq=-1, dr=1
  NW = 3, // dq=-1, dr=0
  N = 4, // dq=0, dr=-1
  NE = 5, // dq=1, dr=-1
}

export enum VertexDirection {
  E = 0,
  SE = 1,
  SW = 2,
  W = 3,
  NW = 4,
  NE = 5,
}

function verticesForEdge(edge: EdgeDirection): [VertexDirection, VertexDirection] {
  const v1 = edge as unknown as VertexDirection;
  const v2 = ((edge + 1) % 6) as VertexDirection;
  return [v1, v2];
}

export interface Move {
  q: number;
  r: number;
  edgeIndex: EdgeDirection;
  oldState: EdgeState;
  newState: EdgeState;
}

export class Grid {
  radius: number;
  hexagons: Map<string, Hex>;
  edgeStates: Map<string, EdgeState>;
  solutionEdges: Set<string>;
  history: Move[];
  historyIndex: number; // Points to the last applied move. -1 if no moves.

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

  addHex(q: number, r: number) {
    const key = `${q},${r}`;
    this.hexagons.set(key, {
      q,
      r,
      active: HexState.UNKNOWN,
    });
  }

  getHex(q: number, r: number): Hex | undefined {
    return this.hexagons.get(`${q},${r}`);
  }

  getDirectionVector(direction: EdgeDirection): { dq: number; dr: number } {
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

  getNeighbor(q: number, r: number, direction: EdgeDirection): Hex | undefined {
    const d = this.getDirectionVector(direction);
    return this.getHex(q + d.dq, r + d.dr);
  }

  getAllHexes() {
    return this.hexagons.values();
  }

  getCanonicalEdgeKey(q: number, r: number, dir: EdgeDirection): string {
    const d = this.getDirectionVector(dir);
    const nq = q + d.dq;
    const nr = r + d.dr;
    const ndir = (dir + 3) % 6;

    const k1 = `${q},${r},${dir}`;
    const k2 = `${nq},${nr},${ndir}`;

    return k1 < k2 ? k1 : k2;
  }

  getEdgeState(q: number, r: number, dir: EdgeDirection): EdgeState {
    const key = this.getCanonicalEdgeKey(q, r, dir);
    return this.edgeStates.get(key) || EdgeState.UNKNOWN;
  }

  setEdgeState(
    q: number,
    r: number,
    edgeIndex: EdgeDirection,
    newState: EdgeState,
    recordMove: boolean = true
  ) {
    const key = this.getCanonicalEdgeKey(q, r, edgeIndex);
    const existing = this.edgeStates.get(key) || EdgeState.UNKNOWN;

    if (existing === newState && recordMove) return;

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

    this.edgeStates.set(key, newState);

    const [v1, v2] = verticesForEdge(edgeIndex);
    const hex = this.getHex(q, r);
    if (hex) {
      this.checkVertex(hex, v1);
      this.checkVertex(hex, v2);
    }
  }

  undo() {
    if (this.historyIndex < 0) return;

    const move = this.history[this.historyIndex];
    if (move) {
      this.setEdgeState(move.q, move.r, move.edgeIndex, move.oldState, false);
      this.historyIndex--;
    }
  }

  redo() {
    if (this.historyIndex >= this.history.length - 1) return;

    this.historyIndex++;
    const move = this.history[this.historyIndex];
    if (move) {
      this.setEdgeState(move.q, move.r, move.edgeIndex, move.newState, false);
    }
  }

  loadHistory(history: Move[], index: number) {
    // Replay history
    this.history = history;
    this.historyIndex = -1; // Reset to start replaying

    // We can either just set the state directly or replay.
    // Replaying ensures consistency if we rely on side effects,
    // but here we just want to restore the grid and the history pointer.
    // However, since we want to be able to undo/redo from this point,
    // we should validly populate the grid.

    // Simplest way: clear grid edges (which are already cleared on load)
    // and apply all moves up to index.

    for (let i = 0; i <= index; i++) {
      const move = this.history[i];
      if (move) {
        // Apply move without recording
        this.setEdgeState(move.q, move.r, move.edgeIndex, move.newState, false);
      }
      this.historyIndex = i;
    }
  }

  getVertexState(hex: Hex, cornerIndex: VertexDirection) {
    const e1Index = ((cornerIndex + 5) % 6) as EdgeDirection;
    const s1 = this.getEdgeState(hex.q, hex.r, e1Index);

    const e2Index = cornerIndex as unknown as EdgeDirection;
    const s2 = this.getEdgeState(hex.q, hex.r, e2Index);

    const n1 = this.getNeighbor(hex.q, hex.r, e1Index);
    const n2 = this.getNeighbor(hex.q, hex.r, e2Index);
    const dirN1toN2 = ((cornerIndex + 1) % 6) as EdgeDirection;
    const dirN2toN1 = ((cornerIndex + 4) % 6) as EdgeDirection;

    let s3 = EdgeState.UNKNOWN;
    let neighborContext: { hex: Hex; edgeIndex: EdgeDirection } | null = null;

    if (n1) {
      s3 = this.getEdgeState(n1.q, n1.r, dirN1toN2);
      neighborContext = { hex: n1, edgeIndex: dirN1toN2 };
    } else if (n2) {
      s3 = this.getEdgeState(n2.q, n2.r, dirN2toN1);
      neighborContext = { hex: n2, edgeIndex: dirN2toN1 };
    } else {
      s3 = EdgeState.CALCULATED_OFF;
    }

    const forcesOff = (aVal: EdgeState, bVal: EdgeState) => {
      if (aVal === EdgeState.ACTIVE && bVal === EdgeState.ACTIVE) return true;
      const isInactive = (v: EdgeState) => v === EdgeState.OFF || v === EdgeState.CALCULATED_OFF;
      if (isInactive(aVal) && isInactive(bVal)) return true;
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

  checkVertex(hex: Hex, cornerIndex: VertexDirection) {
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
      this.setEdgeState(
        ctx.neighborContext.hex.q,
        ctx.neighborContext.hex.r,
        ctx.neighborContext.edgeIndex,
        EdgeState.CALCULATED_OFF
      );
    }
  }

  loadBinaryMap(buffer: ArrayBuffer) {
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
        const active: HexState = regionBit === 1 ? HexState.INSIDE : HexState.OUTSIDE;
        const count = (byte >> 1) & 0x7;
        const show = (byte >> 4) & 0x1;

        this.addHex(q, r);
        const hex = this.getHex(q, r)!;
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
        const neighbor = this.getNeighbor(hex.q, hex.r, dir as EdgeDirection);
        const nState = neighbor ? neighbor.active : HexState.OUTSIDE;

        if (myState !== nState) {
          const key = this.getCanonicalEdgeKey(hex.q, hex.r, dir as EdgeDirection);
          this.solutionEdges.add(key);
        }
      }
    }
  }

  isSolved(): boolean {
    for (const key of this.solutionEdges) {
      if (this.edgeStates.get(key) !== EdgeState.ACTIVE) return false;
    }

    for (const [key, state] of this.edgeStates) {
      if (state === EdgeState.ACTIVE) {
        if (!this.solutionEdges.has(key)) return false;
      }
    }

    return true;
  }
}
