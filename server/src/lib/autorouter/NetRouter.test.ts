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
      { key: "B", x: 100, y: 100 },
      { key: "C", x: 1, y: 0 },
    ];
    const pairs = buildSpanningPairs(pads);
    expect(pairs[0].from.key).toBe("A");
    expect(pairs[0].to.key).toBe("C");
  });

  it("returns empty array for single-pad net", () => {
    const pads = [{ key: "A", x: 0, y: 0 }];
    const pairs = buildSpanningPairs(pads);
    expect(pairs.length).toBe(0);
  });
});
