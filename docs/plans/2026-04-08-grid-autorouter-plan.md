# Grid-Based A* Autorouter Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace Claude-based trace routing with a deterministic grid-based A* autorouter that guarantees obstacle avoidance and clearance.

**Architecture:** Six modules under `server/src/lib/autorouter/` — types, GridBuilder, PathFinder, NetRouter, smoothing, and a public index. The autorouter takes a `CircuitDesign` and returns `Trace[]` in the exact same format the app already uses. Integration is a single function swap in `server/src/routes/reroute.ts`.

**Tech Stack:** TypeScript, vitest (testing), existing footprintTable.ts + padPositions.ts utilities.

**Design doc:** `docs/plans/2026-04-08-grid-autorouter-design.md`

---

### Task 1: Set Up Testing Framework

**Files:**
- Modify: `server/package.json`
- Create: `server/vitest.config.ts`

**Step 1: Install vitest**

Run:
```bash
cd server && npm install --save-dev vitest
```

**Step 2: Create vitest config**

Create `server/vitest.config.ts`:
```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["src/**/*.test.ts"],
  },
});
```

**Step 3: Add test script to server/package.json**

Add to the `"scripts"` block:
```json
"test": "vitest run",
"test:watch": "vitest"
```

**Step 4: Verify vitest runs**

Run: `cd server && npm test`
Expected: vitest runs, finds no test files, exits cleanly.

**Step 5: Commit**

```bash
git add server/package.json server/vitest.config.ts server/package-lock.json
git commit -m "chore: add vitest testing framework to server"
```

---

### Task 2: Create Autorouter Types

**Files:**
- Create: `server/src/lib/autorouter/types.ts`
- Create: `server/src/lib/autorouter/types.test.ts`

**Step 1: Write the test**

Create `server/src/lib/autorouter/types.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import {
  CellFlag,
  createGrid,
  toGridCoord,
  toBoardCoord,
  getCell,
  setCell,
  hasFlag,
  getNetId,
  setNetId,
} from "./types.js";

describe("CellFlag constants", () => {
  it("flags are unique bit positions", () => {
    const flags = [
      CellFlag.BLOCKED_FRONT,
      CellFlag.BLOCKED_BACK,
      CellFlag.TRACE_FRONT,
      CellFlag.TRACE_BACK,
      CellFlag.PAD,
      CellFlag.VIA,
      CellFlag.KEEPOUT,
    ];
    // Each flag should be a power of 2
    for (const f of flags) {
      expect(f & (f - 1)).toBe(0);
      expect(f).toBeGreaterThan(0);
    }
    // All flags combined should have no collisions
    const combined = flags.reduce((a, b) => a | b, 0);
    expect(combined).toBe(0x7f); // bits 0-6
  });
});

describe("createGrid", () => {
  it("creates grid with correct dimensions", () => {
    // 10mm x 5mm board at 0.25mm cells = 40 x 20
    const grid = createGrid(10, 5, 0.25);
    expect(grid.cols).toBe(40);
    expect(grid.rows).toBe(20);
    expect(grid.cellSize).toBe(0.25);
    expect(grid.cells.length).toBe(800);
    expect(grid.netMap.length).toBe(800);
  });

  it("initializes all cells to 0 and netMap to -1", () => {
    const grid = createGrid(2, 2, 0.5);
    for (let i = 0; i < grid.cells.length; i++) {
      expect(grid.cells[i]).toBe(0);
      expect(grid.netMap[i]).toBe(-1);
    }
  });
});

describe("coordinate conversion", () => {
  it("converts board coords to grid coords", () => {
    expect(toGridCoord(5.0, 0.25)).toBe(20);
    expect(toGridCoord(0.0, 0.25)).toBe(0);
    expect(toGridCoord(2.5, 0.25)).toBe(10);
  });

  it("rounds to nearest cell", () => {
    expect(toGridCoord(5.1, 0.25)).toBe(20); // 5.1/0.25 = 20.4 → 20
    expect(toGridCoord(5.2, 0.25)).toBe(21); // 5.2/0.25 = 20.8 → 21
  });

  it("converts grid coords back to board coords", () => {
    expect(toBoardCoord(20, 0.25)).toBe(5.0);
    expect(toBoardCoord(0, 0.25)).toBe(0.0);
  });
});

describe("cell access", () => {
  it("get and set cell flags", () => {
    const grid = createGrid(4, 4, 0.5); // 8x8 grid
    setCell(grid, 3, 5, CellFlag.BLOCKED_FRONT);
    expect(hasFlag(grid, 3, 5, CellFlag.BLOCKED_FRONT)).toBe(true);
    expect(hasFlag(grid, 3, 5, CellFlag.KEEPOUT)).toBe(false);
  });

  it("flags are additive via OR", () => {
    const grid = createGrid(4, 4, 0.5);
    setCell(grid, 2, 2, CellFlag.BLOCKED_FRONT);
    setCell(grid, 2, 2, CellFlag.PAD);
    expect(hasFlag(grid, 2, 2, CellFlag.BLOCKED_FRONT)).toBe(true);
    expect(hasFlag(grid, 2, 2, CellFlag.PAD)).toBe(true);
  });

  it("get and set net IDs", () => {
    const grid = createGrid(4, 4, 0.5);
    setNetId(grid, 1, 1, 5);
    expect(getNetId(grid, 1, 1)).toBe(5);
    expect(getNetId(grid, 0, 0)).toBe(-1);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/lib/autorouter/types.test.ts`
Expected: FAIL — module `./types.js` does not exist.

**Step 3: Write the implementation**

Create `server/src/lib/autorouter/types.ts`:
```typescript
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
```

**Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/lib/autorouter/types.test.ts`
Expected: All tests PASS.

**Step 5: Commit**

```bash
git add server/src/lib/autorouter/types.ts server/src/lib/autorouter/types.test.ts
git commit -m "feat(autorouter): add grid types, cell flags, and coordinate helpers"
```

---

### Task 3: Create GridBuilder

**Files:**
- Create: `server/src/lib/autorouter/GridBuilder.ts`
- Create: `server/src/lib/autorouter/GridBuilder.test.ts`
- Reference: `server/src/lib/footprintTable.ts:168-189` (getComponentBounds)
- Reference: `server/src/lib/padPositions.ts:391-413` (computePadPositions)

**Step 1: Write the test**

Create `server/src/lib/autorouter/GridBuilder.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { buildGrid, stampTrace } from "./GridBuilder.js";
import { CellFlag, hasFlag, getNetId, toGridCoord } from "./types.js";
import type { CircuitDesign } from "../../../../src/types/circuit.js";

function makeDesign(overrides: Partial<CircuitDesign> = {}): CircuitDesign {
  return {
    name: "test",
    description: "test",
    components: [],
    connections: [],
    board: { width: 20, height: 20, layers: 2, cornerRadius: 0 },
    notes: [],
    ...overrides,
  };
}

describe("buildGrid — empty board", () => {
  it("creates grid with correct dimensions", () => {
    const design = makeDesign();
    const { grid } = buildGrid(design);
    // 20mm / 0.25mm = 80 cells each axis
    expect(grid.cols).toBe(80);
    expect(grid.rows).toBe(80);
  });

  it("stamps board edge keepout", () => {
    const design = makeDesign();
    const { grid } = buildGrid(design);
    // Cell (0,0) is at the board edge → should be KEEPOUT
    expect(hasFlag(grid, 0, 0, CellFlag.KEEPOUT)).toBe(true);
    // Cell at 2mm margin = 8 cells in → still KEEPOUT
    expect(hasFlag(grid, 7, 7, CellFlag.KEEPOUT)).toBe(true);
    // Cell at 2.25mm in = 9 cells → should be clear
    expect(hasFlag(grid, 9, 9, CellFlag.KEEPOUT)).toBe(false);
    // Center of board should be clear
    expect(hasFlag(grid, 40, 40, CellFlag.KEEPOUT)).toBe(false);
  });
});

describe("buildGrid — component footprint stamping", () => {
  it("stamps component body as BLOCKED_FRONT", () => {
    const design = makeDesign({
      components: [
        {
          ref: "R1",
          type: "resistor",
          value: "1k",
          package: "0805",
          description: "resistor",
          pins: [
            { id: "1", name: "A", type: "passive" },
            { id: "2", name: "B", type: "passive" },
          ],
          schematicPosition: { x: 0, y: 0, rotation: 0 },
          pcbPosition: { x: 10, y: 10, rotation: 0 },
        },
      ],
      connections: [
        { netName: "N1", pins: [{ ref: "R1", pin: "1" }, { ref: "R1", pin: "2" }] },
      ],
    });
    const { grid } = buildGrid(design);
    // Component center at (10,10) → grid (40,40)
    // 0805 body should be blocked around center
    expect(hasFlag(grid, 40, 40, CellFlag.BLOCKED_FRONT)).toBe(true);
  });

  it("carves out pads from blocked footprint", () => {
    const design = makeDesign({
      components: [
        {
          ref: "R1",
          type: "resistor",
          value: "1k",
          package: "0805",
          description: "resistor",
          pins: [
            { id: "1", name: "A", type: "passive" },
            { id: "2", name: "B", type: "passive" },
          ],
          schematicPosition: { x: 0, y: 0, rotation: 0 },
          pcbPosition: { x: 10, y: 10, rotation: 0 },
        },
      ],
      connections: [
        { netName: "N1", pins: [{ ref: "R1", pin: "1" }, { ref: "R1", pin: "2" }] },
      ],
    });
    const { grid } = buildGrid(design);
    // Pad locations should have PAD flag and NOT BLOCKED_FRONT
    // 0805 pad 1 is at x offset -0.95mm → board (9.05, 10) → grid (36, 40)
    const padGx = toGridCoord(9.05, 0.25);
    const padGy = toGridCoord(10, 0.25);
    expect(hasFlag(grid, padGx, padGy, CellFlag.PAD)).toBe(true);
    expect(hasFlag(grid, padGx, padGy, CellFlag.BLOCKED_FRONT)).toBe(false);
  });
});

describe("buildGrid — net ID assignment", () => {
  it("assigns net IDs to pad cells", () => {
    const design = makeDesign({
      components: [
        {
          ref: "R1",
          type: "resistor",
          value: "1k",
          package: "0805",
          description: "resistor",
          pins: [
            { id: "1", name: "A", type: "passive" },
            { id: "2", name: "B", type: "passive" },
          ],
          schematicPosition: { x: 0, y: 0, rotation: 0 },
          pcbPosition: { x: 10, y: 10, rotation: 0 },
        },
      ],
      connections: [
        { netName: "N1", pins: [{ ref: "R1", pin: "1" }, { ref: "R1", pin: "2" }] },
      ],
    });
    const { grid, netIndex } = buildGrid(design);
    const netId = netIndex.get("N1");
    expect(netId).toBeDefined();
    // Pad cell should have the net ID
    const padGx = toGridCoord(9.05, 0.25);
    const padGy = toGridCoord(10, 0.25);
    expect(getNetId(grid, padGx, padGy)).toBe(netId);
  });
});

describe("stampTrace", () => {
  it("marks trace cells as TRACE_FRONT with net ID", () => {
    const design = makeDesign();
    const { grid } = buildGrid(design);
    const path = [
      { x: 20, y: 20 },
      { x: 21, y: 20 },
      { x: 22, y: 20 },
    ];
    stampTrace(grid, path, 3, 1); // netId 3, inflate 1
    expect(hasFlag(grid, 20, 20, CellFlag.TRACE_FRONT)).toBe(true);
    expect(hasFlag(grid, 21, 20, CellFlag.TRACE_FRONT)).toBe(true);
    expect(getNetId(grid, 20, 20)).toBe(3);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/lib/autorouter/GridBuilder.test.ts`
Expected: FAIL — module `./GridBuilder.js` does not exist.

**Step 3: Write the implementation**

Create `server/src/lib/autorouter/GridBuilder.ts`:
```typescript
import {
  type Grid,
  type GridPoint,
  CellFlag,
  CELL_SIZE,
  BOARD_MARGIN,
  TRACE_CLEARANCE,
  createGrid,
  toGridCoord,
  setCell,
  clearCell,
  setNetId,
  hasFlag,
} from "./types.js";
import type { CircuitDesign } from "../../../../src/types/circuit.js";
import {
  getFootprintDimensions,
  getComponentBounds,
} from "../footprintTable.js";
import { computePadPositions } from "../padPositions.js";

export interface BuildGridResult {
  grid: Grid;
  netIndex: Map<string, number>; // netName → numeric ID
  padPositions: Map<string, { x: number; y: number }>; // "R1.1" → board coords
}

/**
 * Build the obstacle grid from a circuit design.
 * Stamps board margin, component footprints, and pads.
 */
export function buildGrid(design: CircuitDesign): BuildGridResult {
  const board = design.board;
  const grid = createGrid(board.width, board.height, CELL_SIZE);

  // ── 1. Build net name → numeric ID lookup ────────────────────
  const netIndex = new Map<string, number>();
  design.connections.forEach((conn, i) => {
    netIndex.set(conn.netName, i);
  });

  // ── 2. Compute absolute pad positions ────────────────────────
  const rawPads = computePadPositions(design.components as any);
  const padPositions = new Map<string, { x: number; y: number }>();
  for (const p of rawPads) {
    padPositions.set(`${p.ref}.${p.pinId}`, { x: p.x, y: p.y });
  }

  // ── 3. Build pin → netId lookup ──────────────────────────────
  const pinToNet = new Map<string, number>();
  for (const conn of design.connections) {
    const netId = netIndex.get(conn.netName)!;
    for (const p of conn.pins) {
      pinToNet.set(`${p.ref}.${p.pin}`, netId);
    }
  }

  // ── 4. Stamp board edge KEEPOUT ──────────────────────────────
  const marginCells = Math.ceil(BOARD_MARGIN / CELL_SIZE);
  for (let gy = 0; gy < grid.rows; gy++) {
    for (let gx = 0; gx < grid.cols; gx++) {
      if (
        gx < marginCells ||
        gx >= grid.cols - marginCells ||
        gy < marginCells ||
        gy >= grid.rows - marginCells
      ) {
        setCell(grid, gx, gy, CellFlag.KEEPOUT);
      }
    }
  }

  // ── 5. Stamp component footprints as BLOCKED_FRONT ───────────
  const clearanceInflate = Math.ceil(TRACE_CLEARANCE / CELL_SIZE);

  for (const comp of design.components) {
    const fp = getFootprintDimensions(comp.value, comp.package, comp.type);
    const bounds = getComponentBounds(
      comp.pcbPosition.x,
      comp.pcbPosition.y,
      comp.pcbPosition.rotation,
      fp,
    );

    // Inflate by trace clearance
    const gxMin = Math.max(0, toGridCoord(bounds.left, CELL_SIZE) - clearanceInflate);
    const gxMax = Math.min(grid.cols - 1, toGridCoord(bounds.right, CELL_SIZE) + clearanceInflate);
    const gyMin = Math.max(0, toGridCoord(bounds.top, CELL_SIZE) - clearanceInflate);
    const gyMax = Math.min(grid.rows - 1, toGridCoord(bounds.bottom, CELL_SIZE) + clearanceInflate);

    for (let gy = gyMin; gy <= gyMax; gy++) {
      for (let gx = gxMin; gx <= gxMax; gx++) {
        setCell(grid, gx, gy, CellFlag.BLOCKED_FRONT);
      }
    }
  }

  // ── 6. Carve out pads ────────────────────────────────────────
  // Pads punch through footprint blocks and get their net ID.
  // We stamp a small area around each pad center to allow trace entry.
  const padInflate = Math.ceil(TRACE_CLEARANCE / CELL_SIZE);

  for (const [key, pos] of padPositions) {
    const netId = pinToNet.get(key) ?? -1;
    const cx = toGridCoord(pos.x, CELL_SIZE);
    const cy = toGridCoord(pos.y, CELL_SIZE);

    for (let dy = -padInflate; dy <= padInflate; dy++) {
      for (let dx = -padInflate; dx <= padInflate; dx++) {
        const gx = cx + dx;
        const gy = cy + dy;
        if (gx < 0 || gx >= grid.cols || gy < 0 || gy >= grid.rows) continue;

        // Clear the footprint block at this cell and set PAD + net
        clearCell(grid, gx, gy, CellFlag.BLOCKED_FRONT);
        clearCell(grid, gx, gy, CellFlag.KEEPOUT);
        setCell(grid, gx, gy, CellFlag.PAD);
        if (netId >= 0) {
          setNetId(grid, gx, gy, netId);
        }
      }
    }
  }

  return { grid, netIndex, padPositions };
}

/**
 * Stamp a routed path onto the grid so it becomes an obstacle for future nets.
 */
export function stampTrace(
  grid: Grid,
  path: GridPoint[],
  netId: number,
  inflate: number,
): void {
  for (const pt of path) {
    for (let dy = -inflate; dy <= inflate; dy++) {
      for (let dx = -inflate; dx <= inflate; dx++) {
        const gx = pt.x + dx;
        const gy = pt.y + dy;
        if (gx < 0 || gx >= grid.cols || gy < 0 || gy >= grid.rows) continue;
        setCell(grid, gx, gy, CellFlag.TRACE_FRONT);
        setNetId(grid, gx, gy, netId);
      }
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/lib/autorouter/GridBuilder.test.ts`
Expected: All tests PASS.

**Step 5: Commit**

```bash
git add server/src/lib/autorouter/GridBuilder.ts server/src/lib/autorouter/GridBuilder.test.ts
git commit -m "feat(autorouter): add GridBuilder — stamp footprints, pads, and keepout zones"
```

---

### Task 4: Create PathFinder

**Files:**
- Create: `server/src/lib/autorouter/PathFinder.ts`
- Create: `server/src/lib/autorouter/PathFinder.test.ts`

**Step 1: Write the test**

Create `server/src/lib/autorouter/PathFinder.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { findPath } from "./PathFinder.js";
import {
  createGrid,
  CellFlag,
  setCell,
  setNetId,
  type GridPoint,
} from "./types.js";

describe("findPath — open grid", () => {
  it("finds straight horizontal path", () => {
    const grid = createGrid(10, 10, 0.25); // 40x40
    const result = findPath(grid, { x: 5, y: 20 }, { x: 35, y: 20 }, 0, 0);
    expect(result.found).toBe(true);
    expect(result.path.length).toBeGreaterThan(0);
    // Start and end should match
    expect(result.path[0]).toEqual({ x: 5, y: 20 });
    expect(result.path[result.path.length - 1]).toEqual({ x: 35, y: 20 });
  });

  it("finds diagonal path", () => {
    const grid = createGrid(10, 10, 0.25);
    const result = findPath(grid, { x: 5, y: 5 }, { x: 15, y: 15 }, 0, 0);
    expect(result.found).toBe(true);
    // Diagonal should be shorter than L-shaped
    expect(result.cost).toBeLessThan(20);
  });
});

describe("findPath — obstacle avoidance", () => {
  it("routes around a blocked rectangle", () => {
    const grid = createGrid(10, 10, 0.25); // 40x40
    // Place a wall from (15,10) to (15,30) — vertical barrier
    for (let gy = 10; gy <= 30; gy++) {
      setCell(grid, 15, gy, CellFlag.BLOCKED_FRONT);
    }
    const result = findPath(grid, { x: 5, y: 20 }, { x: 25, y: 20 }, 0, 0);
    expect(result.found).toBe(true);
    // Path should not pass through x=15 between y=10..30
    for (const pt of result.path) {
      if (pt.x === 15 && pt.y >= 10 && pt.y <= 30) {
        expect.unreachable("Path passed through blocked wall");
      }
    }
  });

  it("returns not found when completely blocked", () => {
    const grid = createGrid(10, 10, 0.25); // 40x40
    // Wall off the entire column at x=20
    for (let gy = 0; gy < 40; gy++) {
      setCell(grid, 20, gy, CellFlag.BLOCKED_FRONT);
    }
    const result = findPath(grid, { x: 5, y: 20 }, { x: 35, y: 20 }, 0, 0);
    expect(result.found).toBe(false);
  });
});

describe("findPath — net awareness", () => {
  it("avoids cells owned by a different net", () => {
    const grid = createGrid(10, 10, 0.25);
    // Mark a barrier owned by net 5
    for (let gy = 10; gy <= 30; gy++) {
      setCell(grid, 15, gy, CellFlag.TRACE_FRONT);
      setNetId(grid, 15, gy, 5);
    }
    // Routing net 0 should avoid it
    const result = findPath(grid, { x: 5, y: 20 }, { x: 25, y: 20 }, 0, 0);
    expect(result.found).toBe(true);
    for (const pt of result.path) {
      if (pt.x === 15 && pt.y >= 10 && pt.y <= 30) {
        expect.unreachable("Path crossed trace of different net");
      }
    }
  });

  it("can traverse cells owned by same net", () => {
    const grid = createGrid(10, 10, 0.25);
    // Mark cells owned by net 0
    for (let gy = 10; gy <= 30; gy++) {
      setCell(grid, 15, gy, CellFlag.TRACE_FRONT);
      setNetId(grid, 15, gy, 0);
    }
    // Routing net 0 can pass through its own cells
    const result = findPath(grid, { x: 5, y: 20 }, { x: 25, y: 20 }, 0, 0);
    expect(result.found).toBe(true);
    // Should take the direct route through x=15
    const throughWall = result.path.some(
      (pt) => pt.x === 15 && pt.y >= 10 && pt.y <= 30,
    );
    expect(throughWall).toBe(true);
  });
});

describe("findPath — trace width inflation", () => {
  it("avoids narrow gaps when trace is wide", () => {
    const grid = createGrid(10, 10, 0.25); // 40x40
    // Create a 1-cell gap at x=20 (only y=20 is open)
    for (let gy = 0; gy < 40; gy++) {
      if (gy !== 20) {
        setCell(grid, 20, gy, CellFlag.BLOCKED_FRONT);
      }
    }
    // With inflate=0 (thin trace), should fit through the gap
    const thin = findPath(grid, { x: 5, y: 20 }, { x: 35, y: 20 }, 0, 0);
    expect(thin.found).toBe(true);

    // With inflate=1 (wider trace), gap is too narrow
    const wide = findPath(grid, { x: 5, y: 20 }, { x: 35, y: 20 }, 0, 1);
    expect(wide.found).toBe(false);
  });
});

describe("findPath — KEEPOUT respected", () => {
  it("will not route through KEEPOUT cells", () => {
    const grid = createGrid(10, 10, 0.25);
    for (let gy = 10; gy <= 30; gy++) {
      setCell(grid, 15, gy, CellFlag.KEEPOUT);
    }
    const result = findPath(grid, { x: 5, y: 20 }, { x: 25, y: 20 }, 0, 0);
    expect(result.found).toBe(true);
    for (const pt of result.path) {
      if (pt.x === 15 && pt.y >= 10 && pt.y <= 30) {
        expect.unreachable("Path went through KEEPOUT");
      }
    }
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/lib/autorouter/PathFinder.test.ts`
Expected: FAIL — module `./PathFinder.js` does not exist.

**Step 3: Write the implementation**

Create `server/src/lib/autorouter/PathFinder.ts`:
```typescript
import {
  type Grid,
  type GridPoint,
  type PathResult,
  CellFlag,
  MOVE_COST_ORTHO,
  MOVE_COST_DIAG,
  hasFlag,
  getNetId,
} from "./types.js";

/* ── 8-directional neighbours ─────────────────────────────────── */
const DIRS: { dx: number; dy: number; cost: number }[] = [
  { dx:  1, dy:  0, cost: MOVE_COST_ORTHO },  // E
  { dx: -1, dy:  0, cost: MOVE_COST_ORTHO },  // W
  { dx:  0, dy:  1, cost: MOVE_COST_ORTHO },  // N
  { dx:  0, dy: -1, cost: MOVE_COST_ORTHO },  // S
  { dx:  1, dy:  1, cost: MOVE_COST_DIAG  },  // NE
  { dx: -1, dy:  1, cost: MOVE_COST_DIAG  },  // NW
  { dx:  1, dy: -1, cost: MOVE_COST_DIAG  },  // SE
  { dx: -1, dy: -1, cost: MOVE_COST_DIAG  },  // SW
];

/* ── Heuristic: octile distance ───────────────────────────────── */
function heuristic(ax: number, ay: number, bx: number, by: number): number {
  const dx = Math.abs(bx - ax);
  const dy = Math.abs(by - ay);
  return Math.max(dx, dy) + 0.414 * Math.min(dx, dy);
}

/* ── Cell passability check ───────────────────────────────────── */
function isPassable(
  grid: Grid,
  gx: number,
  gy: number,
  netId: number,
): boolean {
  if (gx < 0 || gx >= grid.cols || gy < 0 || gy >= grid.rows) return false;
  const flags = grid.cells[gy * grid.cols + gx];

  // KEEPOUT is always impassable
  if (flags & CellFlag.KEEPOUT) return false;

  // BLOCKED_FRONT is impassable (unless it's a PAD for our net — but PAD
  // cells have BLOCKED_FRONT cleared by GridBuilder, so this is safe)
  if (flags & CellFlag.BLOCKED_FRONT) return false;

  // Cells with a trace from a different net are impassable
  if (flags & CellFlag.TRACE_FRONT) {
    const cellNet = grid.netMap[gy * grid.cols + gx];
    if (cellNet !== -1 && cellNet !== netId) return false;
  }

  // Cells owned by a different net (pad zones) are impassable
  const cellNet = grid.netMap[gy * grid.cols + gx];
  if (cellNet !== -1 && cellNet !== netId) return false;

  return true;
}

/**
 * Check passability with trace-width inflation.
 * All cells in a (2*inflate+1) square around (gx, gy) must be passable.
 */
function isPassableInflated(
  grid: Grid,
  gx: number,
  gy: number,
  netId: number,
  inflate: number,
): boolean {
  for (let dy = -inflate; dy <= inflate; dy++) {
    for (let dx = -inflate; dx <= inflate; dx++) {
      if (!isPassable(grid, gx + dx, gy + dy, netId)) return false;
    }
  }
  return true;
}

/* ── Binary min-heap priority queue ───────────────────────────── */
interface HeapNode {
  x: number;
  y: number;
  f: number; // g + h
}

class MinHeap {
  private data: HeapNode[] = [];

  get size(): number {
    return this.data.length;
  }

  push(node: HeapNode): void {
    this.data.push(node);
    this.bubbleUp(this.data.length - 1);
  }

  pop(): HeapNode | undefined {
    const top = this.data[0];
    const last = this.data.pop();
    if (this.data.length > 0 && last) {
      this.data[0] = last;
      this.sinkDown(0);
    }
    return top;
  }

  private bubbleUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.data[i].f >= this.data[parent].f) break;
      [this.data[i], this.data[parent]] = [this.data[parent], this.data[i]];
      i = parent;
    }
  }

  private sinkDown(i: number): void {
    const len = this.data.length;
    while (true) {
      let smallest = i;
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      if (left < len && this.data[left].f < this.data[smallest].f) smallest = left;
      if (right < len && this.data[right].f < this.data[smallest].f) smallest = right;
      if (smallest === i) break;
      [this.data[i], this.data[smallest]] = [this.data[smallest], this.data[i]];
      i = smallest;
    }
  }
}

/* ── A* path finder ───────────────────────────────────────────── */

/**
 * Find a path from `start` to `end` on the grid using A*.
 *
 * @param grid       The obstacle grid
 * @param start      Source pad grid coordinate
 * @param end        Target pad grid coordinate
 * @param netId      Net being routed (cells owned by this net are passable)
 * @param inflate    Extra cells of clearance around the path (for trace width)
 */
export function findPath(
  grid: Grid,
  start: GridPoint,
  end: GridPoint,
  netId: number,
  inflate: number,
): PathResult {
  const { cols, rows } = grid;
  const total = cols * rows;

  // Cost arrays
  const gScore = new Float32Array(total);
  gScore.fill(Infinity);

  // Parent tracking for path reconstruction
  const cameFrom = new Int32Array(total);
  cameFrom.fill(-1);

  // Closed set
  const closed = new Uint8Array(total);

  const startIdx = start.y * cols + start.x;
  const endIdx = end.y * cols + end.x;

  gScore[startIdx] = 0;

  const open = new MinHeap();
  open.push({ x: start.x, y: start.y, f: heuristic(start.x, start.y, end.x, end.y) });

  while (open.size > 0) {
    const current = open.pop()!;
    const ci = current.y * cols + current.x;

    if (ci === endIdx) {
      // Reconstruct path
      const path: GridPoint[] = [];
      let idx = endIdx;
      while (idx !== -1) {
        path.push({ x: idx % cols, y: Math.floor(idx / cols) });
        idx = cameFrom[idx];
      }
      path.reverse();
      return { found: true, path, cost: gScore[endIdx] };
    }

    if (closed[ci]) continue;
    closed[ci] = 1;

    for (const dir of DIRS) {
      const nx = current.x + dir.dx;
      const ny = current.y + dir.dy;
      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;

      const ni = ny * cols + nx;
      if (closed[ni]) continue;

      // Check passability (with inflation for trace width)
      if (!isPassableInflated(grid, nx, ny, netId, inflate)) continue;

      const tentativeG = gScore[ci] + dir.cost;
      if (tentativeG < gScore[ni]) {
        gScore[ni] = tentativeG;
        cameFrom[ni] = ci;
        open.push({
          x: nx,
          y: ny,
          f: tentativeG + heuristic(nx, ny, end.x, end.y),
        });
      }
    }
  }

  return { found: false, path: [], cost: Infinity };
}
```

**Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/lib/autorouter/PathFinder.test.ts`
Expected: All tests PASS.

**Step 5: Commit**

```bash
git add server/src/lib/autorouter/PathFinder.ts server/src/lib/autorouter/PathFinder.test.ts
git commit -m "feat(autorouter): add A* PathFinder with 8-way movement and trace width inflation"
```

---

### Task 5: Create Smoothing Module

**Files:**
- Create: `server/src/lib/autorouter/smoothing.ts`
- Create: `server/src/lib/autorouter/smoothing.test.ts`

**Step 1: Write the test**

Create `server/src/lib/autorouter/smoothing.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { gridPathToTrace } from "./smoothing.js";
import type { GridPoint } from "./types.js";

describe("gridPathToTrace", () => {
  it("collapses straight horizontal path to 2 waypoints", () => {
    const path: GridPoint[] = [
      { x: 10, y: 20 },
      { x: 11, y: 20 },
      { x: 12, y: 20 },
      { x: 13, y: 20 },
      { x: 14, y: 20 },
    ];
    const trace = gridPathToTrace(path, "GND", 0.5, 0.25);
    expect(trace.points.length).toBe(2);
    expect(trace.points[0]).toEqual({ x: 2.5, y: 5.0 });
    expect(trace.points[1]).toEqual({ x: 3.5, y: 5.0 });
    expect(trace.netName).toBe("GND");
    expect(trace.width).toBe(0.5);
    expect(trace.layer).toBe("front");
  });

  it("emits waypoint at direction change (L-shape)", () => {
    const path: GridPoint[] = [
      { x: 10, y: 20 },
      { x: 11, y: 20 },
      { x: 12, y: 20 },
      { x: 12, y: 21 },
      { x: 12, y: 22 },
    ];
    const trace = gridPathToTrace(path, "SIG", 0.25, 0.25);
    expect(trace.points.length).toBe(3);
    // Start, bend, end
    expect(trace.points[0]).toEqual({ x: 2.5, y: 5.0 });
    expect(trace.points[1]).toEqual({ x: 3.0, y: 5.0 });
    expect(trace.points[2]).toEqual({ x: 3.0, y: 5.5 });
  });

  it("handles single-segment path (2 cells)", () => {
    const path: GridPoint[] = [
      { x: 4, y: 4 },
      { x: 5, y: 4 },
    ];
    const trace = gridPathToTrace(path, "N1", 0.25, 0.25);
    expect(trace.points.length).toBe(2);
  });

  it("collapses diagonal segments", () => {
    const path: GridPoint[] = [
      { x: 10, y: 10 },
      { x: 11, y: 11 },
      { x: 12, y: 12 },
      { x: 13, y: 13 },
    ];
    const trace = gridPathToTrace(path, "N2", 0.25, 0.25);
    // All same direction → 2 points
    expect(trace.points.length).toBe(2);
  });

  it("snaps endpoints to provided pad coordinates", () => {
    const path: GridPoint[] = [
      { x: 10, y: 20 },
      { x: 11, y: 20 },
      { x: 12, y: 20 },
    ];
    const trace = gridPathToTrace(path, "N1", 0.25, 0.25, {
      start: { x: 2.53, y: 4.98 },
      end: { x: 3.02, y: 5.01 },
    });
    expect(trace.points[0]).toEqual({ x: 2.53, y: 4.98 });
    expect(trace.points[trace.points.length - 1]).toEqual({ x: 3.02, y: 5.01 });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/lib/autorouter/smoothing.test.ts`
Expected: FAIL — module `./smoothing.js` does not exist.

**Step 3: Write the implementation**

Create `server/src/lib/autorouter/smoothing.ts`:
```typescript
import type { GridPoint } from "./types.js";
import type { Trace, TracePoint } from "../../../../src/types/circuit.js";
import { toBoardCoord } from "./types.js";

interface PadSnap {
  start: { x: number; y: number };
  end: { x: number; y: number };
}

/**
 * Convert a cell-by-cell grid path into a minimal-waypoint Trace.
 * Collapses consecutive cells with the same direction into single segments.
 * Optionally snaps first/last point to exact pad centers.
 */
export function gridPathToTrace(
  path: GridPoint[],
  netName: string,
  width: number,
  cellSize: number,
  snap?: PadSnap,
): Trace {
  if (path.length < 2) {
    throw new Error("Path must have at least 2 points");
  }

  const waypoints: TracePoint[] = [];

  // Always emit the first point
  waypoints.push({
    x: toBoardCoord(path[0].x, cellSize),
    y: toBoardCoord(path[0].y, cellSize),
  });

  // Walk path, emit waypoint at each direction change
  let prevDx = path[1].x - path[0].x;
  let prevDy = path[1].y - path[0].y;

  for (let i = 2; i < path.length; i++) {
    const dx = path[i].x - path[i - 1].x;
    const dy = path[i].y - path[i - 1].y;

    if (dx !== prevDx || dy !== prevDy) {
      // Direction changed — emit the previous point as a bend
      waypoints.push({
        x: toBoardCoord(path[i - 1].x, cellSize),
        y: toBoardCoord(path[i - 1].y, cellSize),
      });
      prevDx = dx;
      prevDy = dy;
    }
  }

  // Always emit the last point
  const last = path[path.length - 1];
  waypoints.push({
    x: toBoardCoord(last.x, cellSize),
    y: toBoardCoord(last.y, cellSize),
  });

  // Snap endpoints to exact pad centers if provided
  if (snap) {
    waypoints[0] = { x: snap.start.x, y: snap.start.y };
    waypoints[waypoints.length - 1] = { x: snap.end.x, y: snap.end.y };
  }

  return {
    netName,
    width,
    layer: "front",
    points: waypoints,
  };
}
```

**Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/lib/autorouter/smoothing.test.ts`
Expected: All tests PASS.

**Step 5: Commit**

```bash
git add server/src/lib/autorouter/smoothing.ts server/src/lib/autorouter/smoothing.test.ts
git commit -m "feat(autorouter): add path smoothing — grid paths to minimal polylines"
```

---

### Task 6: Create NetRouter

**Files:**
- Create: `server/src/lib/autorouter/NetRouter.ts`
- Create: `server/src/lib/autorouter/NetRouter.test.ts`

**Step 1: Write the test**

Create `server/src/lib/autorouter/NetRouter.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { orderNets, buildSpanningPairs } from "./NetRouter.js";
import type { Connection } from "../../../../src/types/circuit.js";

describe("orderNets", () => {
  it("puts power nets (GND, VBUS, VCC) first", () => {
    const connections: Connection[] = [
      { netName: "SIG1", pins: [{ ref: "R1", pin: "1" }, { ref: "R2", pin: "1" }] },
      { netName: "GND", pins: [{ ref: "U1", pin: "GND" }, { ref: "C1", pin: "2" }] },
      { netName: "VBUS", pins: [{ ref: "J1", pin: "VBUS" }, { ref: "U1", pin: "VIN" }] },
    ];
    const ordered = orderNets(connections);
    expect(ordered[0].netName).toBe("GND");
    expect(ordered[1].netName).toBe("VBUS");
    expect(ordered[2].netName).toBe("SIG1");
  });

  it("within same priority, sorts by pin count ascending", () => {
    const connections: Connection[] = [
      { netName: "SIG_BIG", pins: [
        { ref: "A", pin: "1" }, { ref: "B", pin: "1" },
        { ref: "C", pin: "1" }, { ref: "D", pin: "1" },
      ]},
      { netName: "SIG_SMALL", pins: [
        { ref: "E", pin: "1" }, { ref: "F", pin: "1" },
      ]},
    ];
    const ordered = orderNets(connections);
    expect(ordered[0].netName).toBe("SIG_SMALL");
    expect(ordered[1].netName).toBe("SIG_BIG");
  });
});

describe("buildSpanningPairs", () => {
  it("returns N-1 pairs for N pads", () => {
    const pads = [
      { key: "U1.GND", x: 0, y: 0 },
      { key: "C1.2", x: 5, y: 0 },
      { key: "R1.1", x: 10, y: 0 },
    ];
    const pairs = buildSpanningPairs(pads);
    expect(pairs.length).toBe(2);
  });

  it("picks nearest unconnected pad first", () => {
    const pads = [
      { key: "A", x: 0, y: 0 },
      { key: "B", x: 100, y: 100 }, // far away
      { key: "C", x: 1, y: 0 },     // very close to A
    ];
    const pairs = buildSpanningPairs(pads);
    // First pair should connect A↔C (nearest), not A↔B
    expect(pairs[0].from.key).toBe("A");
    expect(pairs[0].to.key).toBe("C");
  });

  it("returns empty array for single-pad net", () => {
    const pads = [{ key: "A", x: 0, y: 0 }];
    const pairs = buildSpanningPairs(pads);
    expect(pairs.length).toBe(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/lib/autorouter/NetRouter.test.ts`
Expected: FAIL — module `./NetRouter.js` does not exist.

**Step 3: Write the implementation**

Create `server/src/lib/autorouter/NetRouter.ts`:
```typescript
import type { Connection } from "../../../../src/types/circuit.js";

/* ── Power net detection ──────────────────────────────────────── */
const POWER_NET_NAMES = new Set([
  "GND", "VCC", "VBUS", "VDD", "V+", "V-",
  "3V3", "3.3V", "5V", "12V",
]);

function isPowerNet(name: string): boolean {
  return POWER_NET_NAMES.has(name) || name.toUpperCase().startsWith("V");
}

/* ── Net ordering ─────────────────────────────────────────────── */

/**
 * Order nets for routing: power first, then by pin count ascending,
 * then alphabetical for determinism.
 */
export function orderNets(connections: Connection[]): Connection[] {
  return [...connections].sort((a, b) => {
    const aPower = isPowerNet(a.netName) ? 0 : 1;
    const bPower = isPowerNet(b.netName) ? 0 : 1;
    if (aPower !== bPower) return aPower - bPower;

    if (a.pins.length !== b.pins.length) return a.pins.length - b.pins.length;

    return a.netName.localeCompare(b.netName);
  });
}

/* ── Spanning tree pad pairing ────────────────────────────────── */

export interface PadLocation {
  key: string; // "R1.1"
  x: number;   // board mm (used for nearest-neighbour distance)
  y: number;
}

export interface PadPair {
  from: PadLocation;
  to: PadLocation;
}

/**
 * Build a nearest-neighbour spanning tree over pad locations.
 * Returns N-1 pairs for N pads.
 */
export function buildSpanningPairs(pads: PadLocation[]): PadPair[] {
  if (pads.length < 2) return [];

  const pairs: PadPair[] = [];
  const connected = new Set<number>([0]); // start with first pad
  const remaining = new Set<number>();
  for (let i = 1; i < pads.length; i++) remaining.add(i);

  while (remaining.size > 0) {
    let bestDist = Infinity;
    let bestFrom = -1;
    let bestTo = -1;

    for (const ci of connected) {
      for (const ri of remaining) {
        const dx = pads[ci].x - pads[ri].x;
        const dy = pads[ci].y - pads[ri].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < bestDist) {
          bestDist = dist;
          bestFrom = ci;
          bestTo = ri;
        }
      }
    }

    pairs.push({ from: pads[bestFrom], to: pads[bestTo] });
    connected.add(bestTo);
    remaining.delete(bestTo);
  }

  return pairs;
}
```

**Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/lib/autorouter/NetRouter.test.ts`
Expected: All tests PASS.

**Step 5: Commit**

```bash
git add server/src/lib/autorouter/NetRouter.ts server/src/lib/autorouter/NetRouter.test.ts
git commit -m "feat(autorouter): add NetRouter — net ordering and spanning tree decomposition"
```

---

### Task 7: Create Public API (index.ts) and Integration Test

**Files:**
- Create: `server/src/lib/autorouter/index.ts`
- Create: `server/src/lib/autorouter/index.test.ts`

**Step 1: Write the integration test**

Create `server/src/lib/autorouter/index.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { routeDesign } from "./index.js";
import type { CircuitDesign } from "../../../../src/types/circuit.js";

/**
 * Minimal real-world test: one resistor, one LED, one connection.
 * Components are placed far enough apart that routing should succeed.
 */
function makeLedCircuit(): CircuitDesign {
  return {
    name: "LED test",
    description: "Simple LED circuit",
    components: [
      {
        ref: "R1",
        type: "resistor",
        value: "330",
        package: "0805",
        description: "Current limiting resistor",
        pins: [
          { id: "1", name: "A", type: "passive" },
          { id: "2", name: "B", type: "passive" },
        ],
        schematicPosition: { x: 0, y: 0, rotation: 0 },
        pcbPosition: { x: 10, y: 15, rotation: 0 },
      },
      {
        ref: "D1",
        type: "led",
        value: "Red LED",
        package: "LED_5mm_TH",
        description: "5mm LED",
        pins: [
          { id: "1", name: "Anode", type: "passive" },
          { id: "2", name: "Cathode", type: "passive" },
        ],
        schematicPosition: { x: 0, y: 0, rotation: 0 },
        pcbPosition: { x: 20, y: 15, rotation: 0 },
      },
      {
        ref: "J1",
        type: "connector",
        value: "JST_PH_2",
        package: "JST_PH_2",
        description: "2-pin JST connector",
        pins: [
          { id: "1", name: "VCC", type: "power" },
          { id: "2", name: "GND", type: "ground" },
        ],
        schematicPosition: { x: 0, y: 0, rotation: 0 },
        pcbPosition: { x: 3, y: 15, rotation: 0 },
      },
    ],
    connections: [
      {
        netName: "VCC",
        pins: [
          { ref: "J1", pin: "1" },
          { ref: "R1", pin: "1" },
        ],
      },
      {
        netName: "LED_A",
        pins: [
          { ref: "R1", pin: "2" },
          { ref: "D1", pin: "1" },
        ],
      },
      {
        netName: "GND",
        pins: [
          { ref: "D1", pin: "2" },
          { ref: "J1", pin: "2" },
        ],
      },
    ],
    board: { width: 30, height: 30, layers: 2, cornerRadius: 1 },
    notes: [],
  };
}

describe("routeDesign — end-to-end", () => {
  it("routes a simple LED circuit successfully", () => {
    const design = makeLedCircuit();
    const result = routeDesign(design);

    expect(result.failures.length).toBe(0);
    expect(result.traces.length).toBe(3); // VCC, LED_A, GND
    expect(result.stats.routedNets).toBe(3);
    expect(result.stats.failedNets).toBe(0);

    // Each trace should have the right structure
    for (const trace of result.traces) {
      expect(trace.netName).toBeTruthy();
      expect(trace.width).toBeGreaterThanOrEqual(0.25);
      expect(trace.layer).toBe("front");
      expect(trace.points.length).toBeGreaterThanOrEqual(2);

      // All points should be within board bounds
      for (const pt of trace.points) {
        expect(pt.x).toBeGreaterThanOrEqual(0);
        expect(pt.x).toBeLessThanOrEqual(30);
        expect(pt.y).toBeGreaterThanOrEqual(0);
        expect(pt.y).toBeLessThanOrEqual(30);
      }
    }
  });

  it("reports failure when routing is impossible", () => {
    const design = makeLedCircuit();
    // Shrink board so components can't fit with routing space
    design.board.width = 5;
    design.board.height = 5;
    // Move components to be crammed together
    design.components[0].pcbPosition = { x: 2.5, y: 2.5, rotation: 0 };
    design.components[1].pcbPosition = { x: 2.5, y: 2.5, rotation: 0 };
    design.components[2].pcbPosition = { x: 2.5, y: 2.5, rotation: 0 };

    const result = routeDesign(design);
    // Should have at least some failures (components overlapping)
    expect(result.failures.length).toBeGreaterThan(0);
    expect(result.stats.failedNets).toBeGreaterThan(0);
  });

  it("returns deterministic results", () => {
    const design = makeLedCircuit();
    const r1 = routeDesign(design);
    const r2 = routeDesign(design);

    expect(r1.traces.length).toBe(r2.traces.length);
    for (let i = 0; i < r1.traces.length; i++) {
      expect(r1.traces[i].netName).toBe(r2.traces[i].netName);
      expect(r1.traces[i].points).toEqual(r2.traces[i].points);
    }
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/lib/autorouter/index.test.ts`
Expected: FAIL — module `./index.js` does not exist.

**Step 3: Write the implementation**

Create `server/src/lib/autorouter/index.ts`:
```typescript
import type { CircuitDesign, Trace } from "../../../../src/types/circuit.js";
import type { RouterResult, RouteFailure } from "./types.js";
import {
  CELL_SIZE,
  TRACE_CLEARANCE,
  TRACE_WIDTH_SIGNAL,
  TRACE_WIDTH_POWER,
  toGridCoord,
} from "./types.js";
import { buildGrid, stampTrace } from "./GridBuilder.js";
import { findPath } from "./PathFinder.js";
import { orderNets, buildSpanningPairs, type PadLocation } from "./NetRouter.js";
import { gridPathToTrace } from "./smoothing.js";

/* ── Power net detection (matches NetRouter) ──────────────────── */
const POWER_NET_NAMES = new Set([
  "GND", "VCC", "VBUS", "VDD", "V+", "V-",
  "3V3", "3.3V", "5V", "12V",
]);
function isPowerNet(name: string): boolean {
  return POWER_NET_NAMES.has(name) || name.toUpperCase().startsWith("V");
}

function traceWidthForNet(conn: { netName: string; traceWidth?: number }): number {
  if (conn.traceWidth) return conn.traceWidth;
  return isPowerNet(conn.netName) ? TRACE_WIDTH_POWER : TRACE_WIDTH_SIGNAL;
}

/**
 * Route all nets in a circuit design using grid-based A*.
 * Returns the same Trace[] format the app already uses.
 */
export function routeDesign(design: CircuitDesign): RouterResult {
  const t0 = performance.now();

  // 1. Build obstacle grid
  const { grid, netIndex, padPositions } = buildGrid(design);

  // 2. Order nets
  const orderedNets = orderNets(design.connections);

  // 3. Route each net
  const traces: Trace[] = [];
  const failures: RouteFailure[] = [];
  let routedNets = 0;

  for (const conn of orderedNets) {
    const netId = netIndex.get(conn.netName);
    if (netId === undefined) continue;

    const width = traceWidthForNet(conn);
    const inflate = Math.ceil((width / CELL_SIZE) / 2);

    // Gather pad positions for this net
    const netPads: PadLocation[] = [];
    for (const pin of conn.pins) {
      const key = `${pin.ref}.${pin.pin}`;
      const pos = padPositions.get(key);
      if (pos) {
        netPads.push({ key, x: pos.x, y: pos.y });
      }
    }

    if (netPads.length < 2) continue;

    // Decompose into pad pairs (spanning tree)
    const pairs = buildSpanningPairs(netPads);

    let netFailed = false;
    for (const pair of pairs) {
      const startGrid = {
        x: toGridCoord(pair.from.x, CELL_SIZE),
        y: toGridCoord(pair.from.y, CELL_SIZE),
      };
      const endGrid = {
        x: toGridCoord(pair.to.x, CELL_SIZE),
        y: toGridCoord(pair.to.y, CELL_SIZE),
      };

      const result = findPath(grid, startGrid, endGrid, netId, inflate);

      if (result.found) {
        // Stamp trace onto grid (blocks future nets)
        stampTrace(grid, result.path, netId, inflate);

        // Convert to polyline with pad snapping
        const trace = gridPathToTrace(
          result.path,
          conn.netName,
          width,
          CELL_SIZE,
          {
            start: { x: pair.from.x, y: pair.from.y },
            end: { x: pair.to.x, y: pair.to.y },
          },
        );
        traces.push(trace);
      } else {
        netFailed = true;
        failures.push({
          net: conn.netName,
          from: pair.from.key,
          to: pair.to.key,
          reason: "no_path",
        });
      }
    }

    if (!netFailed) routedNets++;
  }

  return {
    traces,
    failures,
    stats: {
      totalNets: design.connections.length,
      routedNets,
      failedNets: failures.length > 0
        ? design.connections.length - routedNets
        : 0,
      timeMs: Math.round(performance.now() - t0),
    },
  };
}
```

**Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/lib/autorouter/index.test.ts`
Expected: All tests PASS.

**Step 5: Commit**

```bash
git add server/src/lib/autorouter/index.ts server/src/lib/autorouter/index.test.ts
git commit -m "feat(autorouter): add routeDesign() public API with end-to-end integration test"
```

---

### Task 8: Integrate Into Reroute Endpoint

**Files:**
- Modify: `server/src/routes/reroute.ts:66-153`

**Step 1: Read the current reroute handler to confirm exact code**

Read `server/src/routes/reroute.ts` in full before editing.

**Step 2: Replace the Claude routing call with routeDesign()**

The key change: replace the loop that calls `callClaude()` + `buildRoutePrompt()` + JSON parsing + retry with a single `routeDesign()` call.

The handler should:
1. Parse the design from `req.body`
2. Call `routeDesign(design)`
3. Run `validateRoutes()` as a safety net
4. Return `{ traces, failures, stats }` to the frontend

Keep the old Claude-based code commented out or behind a flag for fallback.

**Step 3: Verify the server builds**

Run: `cd server && npm run build` (or `npx tsc --noEmit`)
Expected: No type errors.

**Step 4: Manual test**

Start the dev server, open the app, create a simple design (LED + resistor + JST), click "Re-route Traces", and verify:
- Traces appear on the PCB editor
- No traces cross component footprints
- All nets are connected

**Step 5: Commit**

```bash
git add server/src/routes/reroute.ts
git commit -m "feat(autorouter): integrate grid A* router into reroute endpoint"
```

---

### Task 9: Run Full Test Suite and Verify

**Step 1: Run all autorouter tests**

Run: `cd server && npx vitest run src/lib/autorouter/`
Expected: All tests PASS across all 5 test files.

**Step 2: Run existing validation on autorouter output**

The integration test in Task 7 already verifies trace structure. Optionally add a test that feeds autorouter output through `validateRoutes()`:

Add to `server/src/lib/autorouter/index.test.ts`:
```typescript
import { validateRoutes } from "../validateDesign.js";

it("output passes existing route validation", () => {
  const design = makeLedCircuit();
  const result = routeDesign(design);
  const validated = { ...design, traces: result.traces };
  const issues = validateRoutes(validated);
  const errors = issues.filter((i) => i.severity === "error");
  expect(errors).toEqual([]);
});
```

**Step 3: Commit final state**

```bash
git add -A
git commit -m "test(autorouter): add validateRoutes cross-check on autorouter output"
```
