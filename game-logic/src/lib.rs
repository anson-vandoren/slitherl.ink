use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use wasm_bindgen::prelude::*;

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Hex {
    pub q: i32,
    pub r: i32,
    pub s: i32,
    pub active: u8, // 0=Background, 1=Active, 2=Inactive
    pub target_count: Option<u8>,
    pub show_number: bool,
    pub active_edges: [u8; 6], // 0=Neutral, 1=Active, 2=Inactive, 3=CalcOff
}

#[wasm_bindgen]
pub struct Grid {
    radius: i32,
    // We use a simplified key "q,r" for the map, similar to JS
    hexagons: HashMap<String, Hex>,
}

#[wasm_bindgen]
impl Grid {
    #[wasm_bindgen(getter)]
    pub fn radius(&self) -> i32 {
        self.radius
    }

    #[wasm_bindgen(constructor)]
    pub fn new(radius: i32) -> Grid {
        let mut grid = Grid {
            radius,
            hexagons: HashMap::new(),
        };
        grid.generate_grid();
        grid
    }

    fn generate_grid(&mut self) {
        for q in -self.radius..=self.radius {
            let r1 = std::cmp::max(-self.radius, -q - self.radius);
            let r2 = std::cmp::min(self.radius, -q + self.radius);
            for r in r1..=r2 {
                let s = -q - r;
                self.add_hex(q, r, s);
            }
        }
    }

    fn add_hex(&mut self, q: i32, r: i32, s: i32) {
        let key = format!("{},{}", q, r);
        let hex = Hex {
            q,
            r,
            s,
            active: 0,
            target_count: None,
            show_number: false,
            active_edges: [0; 6],
        };
        self.hexagons.insert(key, hex);
    }

    #[wasm_bindgen(js_name = getHex)]
    pub fn get_hex(&self, q: i32, r: i32) -> JsValue {
        let key = format!("{},{}", q, r);
        match self.hexagons.get(&key) {
            Some(hex) => serde_wasm_bindgen::to_value(hex).unwrap(),
            None => JsValue::NULL,
        }
    }

    #[wasm_bindgen(js_name = getNeighbor)]
    pub fn get_neighbor(&self, q: i32, r: i32, direction: usize) -> JsValue {
        let (nq, nr) = Grid::get_neighbor_coords(q, r, direction);
        self.get_hex(nq, nr)
    }

    // Returns all hexes as a JS Array
    #[wasm_bindgen(js_name = getAllHexes)]
    pub fn get_all_hexes(&self) -> JsValue {
        let hexes: Vec<&Hex> = self.hexagons.values().collect();
        serde_wasm_bindgen::to_value(&hexes).unwrap()
    }

    #[wasm_bindgen(js_name = loadBinaryMap)]
    pub fn load_binary_map(&mut self, data: &[u8]) {
        self.hexagons.clear();
        let view = data; // Treat as byte slice directly
                         // Ensure minimal size
        if view.len() < 1 {
            return;
        }
        self.radius = view[0] as i32;

        let mut byte_index = 1;

        for q in -self.radius..=self.radius {
            let r1 = std::cmp::max(-self.radius, -q - self.radius);
            let r2 = std::cmp::min(self.radius, -q + self.radius);
            for r in r1..=r2 {
                if byte_index >= view.len() {
                    break;
                }
                let byte = view[byte_index];

                let region_bit = byte & 0x1;
                let active = if region_bit == 1 { 1 } else { 2 };

                let count = (byte >> 1) & 0x7;
                let show = (byte >> 4) & 0x1;

                let s = -q - r;
                let key = format!("{},{}", q, r);

                let hex = Hex {
                    q,
                    r,
                    s,
                    active,
                    target_count: Some(count),
                    show_number: show == 1,
                    active_edges: [0; 6],
                };
                self.hexagons.insert(key, hex);

                byte_index += 1;
            }
        }
    }

    // Helper for internal use
    fn get_neighbor_coords(q: i32, r: i32, direction: usize) -> (i32, i32) {
        let (dq, dr) = match direction {
            0 => (1, 0),
            1 => (0, 1),
            2 => (-1, 1),
            3 => (-1, 0),
            4 => (0, -1),
            5 => (1, -1),
            _ => (0, 0),
        };
        (q + dq, r + dr)
    }

    #[wasm_bindgen(js_name = setHexActive)]
    pub fn set_hex_active(&mut self, q: i32, r: i32, active: u8) {
        let key = format!("{},{}", q, r);
        if let Some(hex) = self.hexagons.get_mut(&key) {
            hex.active = active;
        }
    }

    #[wasm_bindgen(js_name = setEdgeState)]
    pub fn set_edge_state(&mut self, q: i32, r: i32, edge_index: usize, new_state: u8) {
        let key = format!("{},{}", q, r);

        // We need to mutate the hex, but we also might need to mutate its neighbor.
        // And then verify vertices.
        // To avoid borrowing issues, we'll do this in steps or use interior mutability if needed.
        // But simply:

        if !self.hexagons.contains_key(&key) {
            return;
        }

        {
            let hex = self.hexagons.get_mut(&key).unwrap();
            if hex.active_edges[edge_index] == new_state {
                return;
            }
            hex.active_edges[edge_index] = new_state;
        }

        // Sync neighbor
        let (nq, nr) = Grid::get_neighbor_coords(q, r, edge_index);
        let neighbor_key = format!("{},{}", nq, nr);
        if let Some(neighbor) = self.hexagons.get_mut(&neighbor_key) {
            let neighbor_edge_index = (edge_index + 3) % 6;
            neighbor.active_edges[neighbor_edge_index] = new_state;
        }

        // Check vertices
        self.check_vertex(q, r, edge_index);
        self.check_vertex(q, r, (edge_index + 1) % 6);
    }

    // Core game logic for propagation
    fn check_vertex(&mut self, q: i32, r: i32, corner_index: usize) {
        // We need to look up 3 edges around this vertex.
        // Vertex i connects Edge (i-1) and Edge i of current hex.
        // And Edge connecting the two neighbors.

        let key = format!("{},{}", q, r);
        let (s1, s2, n1_info, n2_info) = {
            let hex = match self.hexagons.get(&key) {
                Some(h) => h,
                None => return, // Should exist
            };

            let e1_index = (corner_index + 5) % 6;
            let s1 = hex.active_edges[e1_index];

            let e2_index = corner_index;
            let s2 = hex.active_edges[e2_index];

            let n1_coords = Grid::get_neighbor_coords(q, r, e1_index);
            let n2_coords = Grid::get_neighbor_coords(q, r, e2_index);

            (s1, s2, (n1_coords, e1_index), (n2_coords, e2_index))
            // n1_coords and e1_index (direction to N1)
        };

        let ((n1q, n1r), dir_to_n1) = n1_info;
        let ((n2q, n2r), dir_to_n2) = n2_info;

        // Neighbors are in direction of e1 (dir_to_n1) and e2 (dir_to_n2).
        // N1 is neighbor at e1_index.
        // N2 is neighbor at e2_index.

        // Calculate the direction from N1 to N2 and N2 to N1
        // If we are at corner `c` of Hex, N1 is at direction `(c-1)%6` (aka e1_index)
        // N2 is at direction `c` (aka e2_index)

        // The edge between N1 and N2:
        // From N1's perspective: it's the edge towards N2.
        // If Hex is at direction (e1_index+3)%6 from N1.
        // N2 is at (corner_index + 1) % 6 relatively?
        // Let's trust the JS logic:
        // dirN1toN2 = (cornerIndex + 1) % 6
        // This relies on consistent orientation.
        // Actually, let's derive it or reuse the logic.
        // In JS: e1Index = (corner + 5) % 6. e2Index = corner.
        // dirN1toN2 = (cornerIndex + 1) % 6.
        // dirN2toN1 = (cornerIndex + 4) % 6.

        let dir_n1_to_n2 = (corner_index + 1) % 6;
        let dir_n2_to_n1 = (corner_index + 4) % 6;

        let n1_key = format!("{},{}", n1q, n1r);
        let n2_key = format!("{},{}", n2q, n2r);

        let mut s3 = -1;
        let mut s3_target = None; // (q, r, edge_idx) to update if needed

        if let Some(n1) = self.hexagons.get(&n1_key) {
            s3 = n1.active_edges[dir_n1_to_n2] as i32;
            s3_target = Some((n1q, n1r, dir_n1_to_n2));
        } else if let Some(n2) = self.hexagons.get(&n2_key) {
            s3 = n2.active_edges[dir_n2_to_n1] as i32;
            s3_target = Some((n2q, n2r, dir_n2_to_n1));
        }

        let effective_s3 = if s3 == -1 { 3 } else { s3 as u8 };

        let states = [s1, s2, effective_s3];
        let active_count = states.iter().filter(|&&s| s == 1).count();
        let inactive_count = states.iter().filter(|&&s| s == 2 || s == 3).count();
        let neutral_count = states.iter().filter(|&&s| s == 0).count();

        if neutral_count == 1 {
            let should_turn_off = active_count == 2 || inactive_count == 2;

            if should_turn_off {
                if s1 == 0 {
                    self.set_edge_state(q, r, (corner_index + 5) % 6, 3);
                } else if s2 == 0 {
                    self.set_edge_state(q, r, corner_index, 3);
                } else if effective_s3 == 0 {
                    // Should match s3 == 0 since -1 -> 3
                    if let Some((tq, tr, ti)) = s3_target {
                        self.set_edge_state(tq, tr, ti, 3);
                    }
                }
            }
        }
    }
}
