/* tslint:disable */
/* eslint-disable */

export class Grid {
  free(): void;
  [Symbol.dispose](): void;
  getNeighbor(q: number, r: number, direction: number): any;
  getAllHexes(): any;
  setEdgeState(q: number, r: number, edge_index: number, new_state: number): void;
  setHexActive(q: number, r: number, active: number): void;
  loadBinaryMap(data: Uint8Array): void;
  constructor(radius: number);
  getHex(q: number, r: number): any;
  readonly radius: number;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_grid_free: (a: number, b: number) => void;
  readonly grid_getAllHexes: (a: number) => any;
  readonly grid_getHex: (a: number, b: number, c: number) => any;
  readonly grid_getNeighbor: (a: number, b: number, c: number, d: number) => any;
  readonly grid_loadBinaryMap: (a: number, b: number, c: number) => void;
  readonly grid_new: (a: number) => number;
  readonly grid_radius: (a: number) => number;
  readonly grid_setEdgeState: (a: number, b: number, c: number, d: number, e: number) => void;
  readonly grid_setHexActive: (a: number, b: number, c: number, d: number) => void;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_externrefs: WebAssembly.Table;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
