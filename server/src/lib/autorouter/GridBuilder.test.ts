import { describe, it, expect } from "vitest";
import { buildGrid, stampTrace } from "./GridBuilder.js";
import { CellFlag, hasFlag, getNetId, toGridCoord } from "./types.js";
import type { CircuitDesign } from "../../types/circuit.js";

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
    expect(grid.cols).toBe(80);
    expect(grid.rows).toBe(80);
  });

  it("stamps board edge keepout", () => {
    const design = makeDesign();
    const { grid } = buildGrid(design);
    expect(hasFlag(grid, 0, 0, CellFlag.KEEPOUT)).toBe(true);
    expect(hasFlag(grid, 7, 7, CellFlag.KEEPOUT)).toBe(true);
    // 2.0mm / 0.25mm = 8 cells of keepout. Cell index 8 is at 2.0mm, still in margin.
    // Cell index 9 is at 2.25mm, should be clear.
    // Actually BOARD_MARGIN is 2.0mm, so cells 0..7 are keepout (indices < 8).
    // But Math.ceil(2.0 / 0.25) = 8, so cells with index < 8 are keepout.
    // Cell 8 should be clear.
    expect(hasFlag(grid, 8, 8, CellFlag.KEEPOUT)).toBe(false);
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
    // 0805 pad 1 center is at x offset -0.95mm from component center
    // Board position: (10 - 0.95, 10) = (9.05, 10)
    // Grid: round(9.05/0.25) = round(36.2) = 36, round(10/0.25) = 40
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
    stampTrace(grid, path, 3, 1);
    expect(hasFlag(grid, 20, 20, CellFlag.TRACE_FRONT)).toBe(true);
    expect(hasFlag(grid, 21, 20, CellFlag.TRACE_FRONT)).toBe(true);
    expect(getNetId(grid, 20, 20)).toBe(3);
  });
});
