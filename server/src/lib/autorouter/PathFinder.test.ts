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
    expect(result.path[0]).toEqual({ x: 5, y: 20 });
    expect(result.path[result.path.length - 1]).toEqual({ x: 35, y: 20 });
  });

  it("finds diagonal path", () => {
    const grid = createGrid(10, 10, 0.25);
    const result = findPath(grid, { x: 5, y: 5 }, { x: 15, y: 15 }, 0, 0);
    expect(result.found).toBe(true);
    expect(result.cost).toBeLessThan(20);
  });
});

describe("findPath — obstacle avoidance", () => {
  it("routes around a blocked rectangle", () => {
    const grid = createGrid(10, 10, 0.25); // 40x40
    // Place a wall from (15,10) to (15,30)
    for (let gy = 10; gy <= 30; gy++) {
      setCell(grid, 15, gy, CellFlag.BLOCKED_FRONT);
    }
    const result = findPath(grid, { x: 5, y: 20 }, { x: 25, y: 20 }, 0, 0);
    expect(result.found).toBe(true);
    for (const pt of result.path) {
      if (pt.x === 15 && pt.y >= 10 && pt.y <= 30) {
        expect.unreachable("Path passed through blocked wall");
      }
    }
  });

  it("returns not found when completely blocked", () => {
    const grid = createGrid(10, 10, 0.25); // 40x40
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
    for (let gy = 10; gy <= 30; gy++) {
      setCell(grid, 15, gy, CellFlag.TRACE_FRONT);
      setNetId(grid, 15, gy, 5);
    }
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
    for (let gy = 10; gy <= 30; gy++) {
      setCell(grid, 15, gy, CellFlag.TRACE_FRONT);
      setNetId(grid, 15, gy, 0);
    }
    const result = findPath(grid, { x: 5, y: 20 }, { x: 25, y: 20 }, 0, 0);
    expect(result.found).toBe(true);
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
    const thin = findPath(grid, { x: 5, y: 20 }, { x: 35, y: 20 }, 0, 0);
    expect(thin.found).toBe(true);

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
