import { describe, it, expect, beforeEach } from 'vitest';
import { Grid, EdgeState, EdgeDirection, VertexDirection } from './grid';

describe('Grid Edge Logic', () => {
  let grid: Grid;

  beforeEach(() => {
    grid = new Grid();
    grid.radius = 1;
    grid.generateGrid();
  });

  // 1. Basic 2-ACTIVE -> 3rd-OFF
  it('should mark 3rd edge OFF when 2 edges are ACTIVE', () => {
    // Hex (0,0), Corner E (0) is between NE(5) and SE(0).
    grid.setEdgeState(0, 0, EdgeDirection.NE, EdgeState.ACTIVE);
    grid.setEdgeState(0, 0, EdgeDirection.SE, EdgeState.ACTIVE);

    // The 3rd edge is outside of (0,0) connecting neighbors.
    // Neighbor 1: (0,0)+NE -> (1,-1). Edge: S(1).
    expect(grid.getEdgeState(1, -1, EdgeDirection.S)).toBe(EdgeState.CALCULATED_OFF);
  });

  // 2. Recovery from 2-ACTIVE
  it('should revert 3rd edge to UNKNOWN when one of 2 ACTIVE edges becomes UNKNOWN', () => {
    grid.setEdgeState(0, 0, EdgeDirection.NE, EdgeState.ACTIVE);
    grid.setEdgeState(0, 0, EdgeDirection.SE, EdgeState.ACTIVE);

    // Safety check
    expect(grid.getEdgeState(1, -1, EdgeDirection.S)).toBe(EdgeState.CALCULATED_OFF);

    // Revert one
    grid.setEdgeState(0, 0, EdgeDirection.NE, EdgeState.UNKNOWN);

    // Expect reversion
    expect(grid.getEdgeState(1, -1, EdgeDirection.S)).toBe(EdgeState.UNKNOWN);
  });

  // 3. Boundary Condition
  // Hex (1,0) at radius 1. Corner E(0).
  // Edges NE(5) and SE(0) are on boundary. s3 is VIRTUAL (CALCULATED_OFF).
  it('should propagate OFF along boundary (dead end)', () => {
    // Set SE to OFF.
    // s2=OFF, s3=CALCULATED_OFF. -> s1(NE) must be OFF.
    grid.setEdgeState(1, 0, EdgeDirection.SE, EdgeState.OFF);

    expect(grid.getEdgeState(1, 0, EdgeDirection.NE)).toBe(EdgeState.CALCULATED_OFF);
  });

  // 4. Recovery at Boundary
  it('should revert boundary propagation when edge is cleared', () => {
    grid.setEdgeState(1, 0, EdgeDirection.SE, EdgeState.OFF);
    expect(grid.getEdgeState(1, 0, EdgeDirection.NE)).toBe(EdgeState.CALCULATED_OFF);

    grid.setEdgeState(1, 0, EdgeDirection.SE, EdgeState.UNKNOWN);
    expect(grid.getEdgeState(1, 0, EdgeDirection.NE)).toBe(EdgeState.UNKNOWN);
  });

  // 5. Chain Reaction
  it('should propagate OFF through a chain', () => {
    // Setup: Hex 0,0. Vertex NE(5). Edges N(4) and NE(5).
    // Force both OFF. This should force the 3rd edge at Vertex 5 to be OFF.
    // 3rd edge is neighbor (0,-1)'s SE(0) edge (connecting (0,-1) to (1,-1)).

    grid.setEdgeState(0, 0, EdgeDirection.N, EdgeState.OFF);
    grid.setEdgeState(0, 0, EdgeDirection.NE, EdgeState.OFF);

    // Expect (0,-1) SE to be OFF.
    expect(grid.getEdgeState(0, -1, EdgeDirection.SE)).toBe(EdgeState.CALCULATED_OFF);

    // Continue chain.
    // Now we have (0,-1) SE is CALCULATED_OFF.
    // Force neighbor's NE(5) edge OFF roughly at same vertex? No, separate.
    // At Hex (0,-1), Vertex E(0) connects NE(5) and SE(0).
    // SE(0) is now OFF. If we force NE(5) OFF (User set), then 3rd edge must be OFF.
    // 3rd edge at Vertex E(0) connects their neighbors.
    // n1(NE) -> (1,-2). n2(SE) -> (1,-1).
    // Edge between (1,-2) and (1,-1) is S(1) of (1,-2).

    grid.setEdgeState(0, -1, EdgeDirection.NE, EdgeState.OFF);

    expect(grid.getEdgeState(1, -2, EdgeDirection.S)).toBe(EdgeState.CALCULATED_OFF);
  });

  // 6. Chain Recovery
  it('should remove chained blocks when anchor is removed', () => {
    // Rebuild the chain from #5.
    grid.setEdgeState(0, 0, EdgeDirection.N, EdgeState.OFF);
    grid.setEdgeState(0, 0, EdgeDirection.NE, EdgeState.OFF);
    // (0,-1) SE is now CALCULATED_OFF

    grid.setEdgeState(0, -1, EdgeDirection.NE, EdgeState.OFF);
    // (1,-2) S is now CALCULATED_OFF

    // Verify setup
    expect(grid.getEdgeState(0, -1, EdgeDirection.SE)).toBe(EdgeState.CALCULATED_OFF);
    expect(grid.getEdgeState(1, -2, EdgeDirection.S)).toBe(EdgeState.CALCULATED_OFF);

    // Break anchor.
    // If we reset (0,0) NE to UNKNOWN.
    grid.setEdgeState(0, 0, EdgeDirection.NE, EdgeState.UNKNOWN);

    // (0,-1) SE should revert to UNKNOWN (no longer forced by N+NE).
    // Consequently, (1,-2) S should revert to UNKNOWN (no longer forced by NE+SE).

    expect(grid.getEdgeState(0, -1, EdgeDirection.SE)).toBe(EdgeState.UNKNOWN);
    expect(grid.getEdgeState(1, -2, EdgeDirection.S)).toBe(EdgeState.UNKNOWN);
  });
});
