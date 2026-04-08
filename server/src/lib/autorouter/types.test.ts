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
