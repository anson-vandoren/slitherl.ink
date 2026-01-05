import { describe, it, expect, beforeEach } from 'vitest';
import { Grid, EdgeState, EdgeDirection } from './grid';
describe('Grid Edge Logic', () => {
    let grid;
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
});
