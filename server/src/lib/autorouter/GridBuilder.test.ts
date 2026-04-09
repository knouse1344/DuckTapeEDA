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

describe("buildGrid — edge connector pad carving", () => {
  it("carves connector pads through KEEPOUT zone to open space", () => {
    const design = makeDesign({
      components: [
        {
          ref: "J1",
          type: "connector",
          value: "USB-C",
          package: "USB-C",
          description: "USB-C connector",
          pins: [
            { id: "VBUS", name: "VBUS", type: "power" },
            { id: "GND", name: "GND", type: "ground" },
            { id: "CC1", name: "CC1", type: "signal" },
            { id: "CC2", name: "CC2", type: "signal" },
          ],
          schematicPosition: { x: 0, y: 0, rotation: 0 },
          pcbPosition: { x: 3, y: 10, rotation: 0 },
        },
      ],
      connections: [
        { netName: "VBUS", pins: [{ ref: "J1", pin: "VBUS" }] },
        { netName: "GND", pins: [{ ref: "J1", pin: "GND" }] },
      ],
    });
    const { grid } = buildGrid(design);

    // USB-C VBUS pad is at offset (-1.75, -3.0) from component center (3, 10)
    // Absolute: (1.25, 7.0) → grid (5, 28)
    // This is inside KEEPOUT (cells 0-7). After connector carving,
    // there must be clear cells from the pad rightward past cell 8.
    const vbusPadGx = toGridCoord(1.25, 0.25);
    const vbusPadGy = toGridCoord(7.0, 0.25);

    expect(hasFlag(grid, vbusPadGx, vbusPadGy, CellFlag.PAD)).toBe(true);
    expect(hasFlag(grid, vbusPadGx, vbusPadGy, CellFlag.KEEPOUT)).toBe(false);

    // Scan rightward — every cell from pad to past KEEPOUT must be clear
    // (no KEEPOUT or BLOCKED_FRONT). This ensures A* has a continuous path.
    const marginCells = Math.ceil(2.0 / 0.25);
    for (let gx = vbusPadGx; gx <= marginCells + 2; gx++) {
      const ko = hasFlag(grid, gx, vbusPadGy, CellFlag.KEEPOUT);
      const bl = hasFlag(grid, gx, vbusPadGy, CellFlag.BLOCKED_FRONT);
      expect(ko).toBe(false);
      expect(bl).toBe(false);
    }
  });
});

describe("buildGrid — unified corridor for multiple connectors on same edge", () => {
  it("carves unified corridor for two connectors on same edge", () => {
    const design = makeDesign({
      board: { width: 40, height: 40, layers: 2, cornerRadius: 0 },
      components: [
        {
          ref: "J1",
          type: "connector",
          value: "USB-C",
          package: "USB-C",
          description: "USB-C",
          pins: [
            { id: "VBUS", name: "VBUS", type: "power" },
            { id: "GND", name: "GND", type: "ground" },
            { id: "CC1", name: "CC1", type: "signal" },
            { id: "CC2", name: "CC2", type: "signal" },
          ],
          schematicPosition: { x: 0, y: 0, rotation: 0 },
          pcbPosition: { x: 3, y: 12, rotation: 0 },
        },
        {
          ref: "J2",
          type: "connector",
          value: "PinHeader_1x3",
          package: "PinHeader_1x3_P2.54mm",
          description: "3-pin header",
          pins: [
            { id: "1", name: "VCC", type: "power" },
            { id: "2", name: "DIN", type: "signal" },
            { id: "3", name: "GND", type: "ground" },
          ],
          schematicPosition: { x: 0, y: 0, rotation: 0 },
          pcbPosition: { x: 3, y: 28, rotation: 0 },
        },
      ],
      connections: [
        { netName: "VBUS", pins: [{ ref: "J1", pin: "VBUS" }, { ref: "J2", pin: "1" }] },
        { netName: "GND", pins: [{ ref: "J1", pin: "GND" }, { ref: "J2", pin: "3" }] },
      ],
    });
    const { grid } = buildGrid(design);

    // Both connectors are on left edge. The corridor between them (y=12 to y=28)
    // should be clear at x = marginCells (cell 8, which is past KEEPOUT).
    const checkX = Math.ceil(2.0 / 0.25); // marginCells = 8
    for (let gy = toGridCoord(12, 0.25); gy <= toGridCoord(28, 0.25); gy++) {
      const blocked = hasFlag(grid, checkX, gy, CellFlag.KEEPOUT) ||
                      hasFlag(grid, checkX, gy, CellFlag.BLOCKED_FRONT);
      if (blocked) {
        expect.unreachable(`Cell (${checkX}, ${gy}) is blocked between two edge connectors`);
      }
    }
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
