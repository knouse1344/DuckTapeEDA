/* ── Cell flag bit positions ──────────────────────────────────── */
export const CellFlag = {
  BLOCKED_FRONT: 0x01, // bit 0: obstacle on front copper
  BLOCKED_BACK:  0x02, // bit 1: reserved — back layer obstacle
  TRACE_FRONT:   0x04, // bit 2: routed trace on front
  TRACE_BACK:    0x08, // bit 3: reserved — routed trace on back
  PAD:           0x10, // bit 4: pad location
  VIA:           0x20, // bit 5: reserved — via
  KEEPOUT:       0x40, // bit 6: unconditional no-go zone
} as const;

/* ── Grid ─────────────────────────────────────────────────────── */
export interface Grid {
  cells: Uint8Array;     // bit flags, length = cols * rows
  netMap: Int16Array;    // net ID per cell (-1 = unowned)
  cols: number;          // grid width in cells
  rows: number;          // grid height in cells
  cellSize: number;      // mm per cell
}

export function createGrid(
  boardWidthMm: number,
  boardHeightMm: number,
  cellSize: number,
): Grid {
  const cols = Math.ceil(boardWidthMm / cellSize);
  const rows = Math.ceil(boardHeightMm / cellSize);
  const len = cols * rows;
  const netMap = new Int16Array(len);
  netMap.fill(-1);
  return { cells: new Uint8Array(len), netMap, cols, rows, cellSize };
}

/* ── Coordinate helpers ───────────────────────────────────────── */
export function toGridCoord(boardMm: number, cellSize: number): number {
  return Math.round(boardMm / cellSize);
}

export function toBoardCoord(gridCoord: number, cellSize: number): number {
  return gridCoord * cellSize;
}

/* ── Cell accessors ───────────────────────────────────────────── */
function idx(grid: Grid, gx: number, gy: number): number {
  return gy * grid.cols + gx;
}

export function getCell(grid: Grid, gx: number, gy: number): number {
  return grid.cells[idx(grid, gx, gy)];
}

export function setCell(
  grid: Grid,
  gx: number,
  gy: number,
  flag: number,
): void {
  grid.cells[idx(grid, gx, gy)] |= flag;
}

export function clearCell(
  grid: Grid,
  gx: number,
  gy: number,
  flag: number,
): void {
  grid.cells[idx(grid, gx, gy)] &= ~flag;
}

export function hasFlag(
  grid: Grid,
  gx: number,
  gy: number,
  flag: number,
): boolean {
  return (grid.cells[idx(grid, gx, gy)] & flag) !== 0;
}

export function getNetId(grid: Grid, gx: number, gy: number): number {
  return grid.netMap[idx(grid, gx, gy)];
}

export function setNetId(
  grid: Grid,
  gx: number,
  gy: number,
  netId: number,
): void {
  grid.netMap[idx(grid, gx, gy)] = netId;
}

/* ── Router result types ──────────────────────────────────────── */
export interface GridPoint {
  x: number; // grid column
  y: number; // grid row
}

export interface PathResult {
  found: boolean;
  path: GridPoint[];
  cost: number;
}

export interface RouteFailure {
  net: string;
  from: string; // "U1.GND"
  to: string;   // "C1.2"
  reason: "no_path" | "out_of_bounds";
}

export interface RouterResult {
  traces: import("../../../../src/types/circuit.js").Trace[];
  failures: RouteFailure[];
  stats: {
    totalNets: number;
    routedNets: number;
    failedNets: number;
    timeMs: number;
  };
}

/* ── Constants ────────────────────────────────────────────────── */
export const CELL_SIZE = 0.25;            // mm per grid cell
export const BOARD_MARGIN = 2.0;          // mm keepout from board edges
export const TRACE_CLEARANCE = 0.2;       // mm between different nets
export const TRACE_WIDTH_SIGNAL = 0.25;   // mm
export const TRACE_WIDTH_POWER = 0.5;     // mm
export const MOVE_COST_ORTHO = 1.0;
export const MOVE_COST_DIAG = 1.414;
