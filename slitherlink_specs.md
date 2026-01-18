# Slitherlink Game Rules & Technical Specifications

## Game Rules

Slitherlink is played on a hexagonal grid (in this implementation). The objective is to connect adjacent dots with lines to form a single continuous loop.

### Core Rules

1.  **Single Loop**: The solution must consist of a single continuous loop that never crosses itself or branches.
2.  **Edge Constraints**:
    - Numbers in a hexagon indicate exactly how many of its 6 edges are part of the loop.
    - Empty hexagons (no number) can have any number of edges involved.
3.  **Coloring / Regions (Implementation Specific)**:
    - The loop effectively divides the grid into two regions: **Inside** (Yellow) and **Outside** (Purple).
    - Adjacent hexagons separated by a loop segment must have different region colors (one Inside, one Outside).
    - Adjacent hexagons NOT separated by a loop segment must belong to the same region.
    - The "Outside" region usually connects to the edge of the map (though not strictly required if the loop encloses an island of "Inside", but practically for generation this is often the case).

## Map Binary Format

The map file is a custom binary format designed for compactness. It describes the grid state (solution) and the puzzle hints.

### File Structure

| Byte Offset | Type      | Description                            |
| :---------- | :-------- | :------------------------------------- |
| 0           | `uint8`   | **Radius** (R) of the hexagonal grid.  |
| 1 to End    | `uint8[]` | **Hexagon Data**, sequentially packed. |

### Hexagon Data Sequence

The hexagons are stored in a specific order iterating through the axial coordinates `(q, r)`:

1.  Outer loop: `q` from `-R` to `+R`.
2.  Inner loop: `r` from `max(-R, -q-R)` to `min(R, -q+R)`.

### Byte Encoding

Each hexagon is represented by a single byte containing three pieces of information:

| Bits    | Mask   | Value Name       | Description                                                                               |
| :------ | :----- | :--------------- | :---------------------------------------------------------------------------------------- |
| 0 (LSB) | `0x1`  | **Region Bit**   | `1` = Inside (Yellow), `0` = Outside (Purple). Use this to reconstruct the solution loop. |
| 1-3     | `0xE`  | **Target Count** | The numeric clue for the hex (0-6). Value is `(byte >> 1) & 0x7`.                         |
| 4       | `0x10` | **Show Number**  | `1` = Show the clue (puzzle hint), `0` = Hide the clue (unknown to player).               |

**Note**: To determine if an edge exists between two adjacent hexes, compare their **Region Bits**. If they differ, an edge exists. If they are the same, no edge exists.

## Map Generator Requirements

To generate valid new maps for this implementation, the following requirements must be met:

### 1. Topology & Connectivity

- **Single Connected Region**: The "Inside" (active) cells must form a single connected component (orthogonally connected neighbors).
- **No Islands of Outside**: The "Outside" (inactive) cells must also form a single connected component (usually connected to the map boundary). This guarantees that the boundary between Inside and Outside forms a **single non-intersecting loop**.
- **Valid Loop**: The boundary between the Inside and Outside regions is the solution loop.

### 2. Difficulty & Hints

- **Solvability**: The puzzle must be solvable using logical deduction without guessing.
- **Uniqueness**: The puzzle must have exactly one unique solution.
- **Clue Visibility**:
  - Not all numbers are shown.
  - **Easy**: Show most numbers.
  - **Medium/Hard**: Hide a percentage of numbers while maintaining unique solvability.
  - The difficulty generation process typically starts with all numbers visible and iteratively removes them, checking at each step that the puzzle remains uniquely solvable.

### 3. Coordinate System

- The game uses **Axial Coordinates** (q, r).
- Radius `R` defines the map size.
- Grid size calculation: The number of hexes is $3R(R+1) + 1$.
