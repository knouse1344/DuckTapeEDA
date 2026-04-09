import { describe, it, expect } from "vitest";
import { routeDesign } from "./index.js";
import { validateRoutes } from "../validateDesign.js";
import type { CircuitDesign } from "../../types/circuit.js";

function makeLedCircuit(): CircuitDesign {
  // Uses realistic through-hole packages on a 40x30mm board.
  // Packages and values are chosen to match the footprint/pad lookup tables exactly.
  return {
    name: "LED test",
    description: "Simple LED circuit",
    components: [
      {
        ref: "R1",
        type: "resistor",
        value: "330",
        package: "Axial_TH",
        description: "Current limiting resistor",
        pins: [
          { id: "1", name: "A", type: "passive" },
          { id: "2", name: "B", type: "passive" },
        ],
        schematicPosition: { x: 0, y: 0, rotation: 0 },
        pcbPosition: { x: 20, y: 15, rotation: 0 },
      },
      {
        ref: "D1",
        type: "led",
        value: "red",
        package: "5mm_TH",
        description: "5mm through-hole LED",
        pins: [
          { id: "1", name: "Anode", type: "passive" },
          { id: "2", name: "Cathode", type: "passive" },
        ],
        schematicPosition: { x: 0, y: 0, rotation: 0 },
        pcbPosition: { x: 32, y: 15, rotation: 0 },
      },
      {
        ref: "J1",
        type: "connector",
        value: "2pin",
        package: "PinHeader_1x2_P2.54mm",
        description: "2-pin through-hole header",
        pins: [
          { id: "1", name: "VCC", type: "power" },
          { id: "2", name: "GND", type: "ground" },
        ],
        schematicPosition: { x: 0, y: 0, rotation: 0 },
        pcbPosition: { x: 8, y: 15, rotation: 0 },
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
    board: { width: 40, height: 30, layers: 2, cornerRadius: 1 },
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

    for (const trace of result.traces) {
      expect(trace.netName).toBeTruthy();
      expect(trace.width).toBeGreaterThanOrEqual(0.25);
      expect(trace.layer).toBe("front");
      expect(trace.points.length).toBeGreaterThanOrEqual(2);

      for (const pt of trace.points) {
        expect(pt.x).toBeGreaterThanOrEqual(0);
        expect(pt.x).toBeLessThanOrEqual(40);
        expect(pt.y).toBeGreaterThanOrEqual(0);
        expect(pt.y).toBeLessThanOrEqual(30);
      }
    }
  });

  it("reports failure when routing is impossible", () => {
    const design = makeLedCircuit();
    design.board.width = 5;
    design.board.height = 5;
    design.components[0].pcbPosition = { x: 2.5, y: 2.5, rotation: 0 };
    design.components[1].pcbPosition = { x: 2.5, y: 2.5, rotation: 0 };
    design.components[2].pcbPosition = { x: 2.5, y: 2.5, rotation: 0 };

    const result = routeDesign(design);
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

  it("output passes existing route validation", () => {
    const design = makeLedCircuit();
    const result = routeDesign(design);

    // Feed autorouter output through the app's existing route validator
    const designWithTraces = { ...design, traces: result.traces };
    const issues = validateRoutes(designWithTraces);
    const errors = issues.filter((i: any) => i.severity === "error");
    expect(errors).toEqual([]);
  });
});

function makeUsbcLedCircuit(): CircuitDesign {
  return {
    name: "USB-C LED test",
    description: "LED powered by USB-C at board edge",
    components: [
      {
        ref: "J1",
        type: "connector",
        value: "USB-C",
        package: "USB-C",
        description: "USB-C power connector",
        pins: [
          { id: "VBUS", name: "VBUS", type: "power" },
          { id: "GND", name: "GND", type: "ground" },
          { id: "CC1", name: "CC1", type: "signal" },
          { id: "CC2", name: "CC2", type: "signal" },
        ],
        schematicPosition: { x: 0, y: 0, rotation: 0 },
        pcbPosition: { x: 3, y: 15, rotation: 0 },
      },
      {
        ref: "R1",
        type: "resistor",
        value: "5.1k",
        package: "0805",
        description: "CC1 pull-down",
        pins: [
          { id: "1", name: "A", type: "passive" },
          { id: "2", name: "B", type: "passive" },
        ],
        schematicPosition: { x: 0, y: 0, rotation: 0 },
        pcbPosition: { x: 15, y: 10, rotation: 0 },
      },
      {
        ref: "R2",
        type: "resistor",
        value: "5.1k",
        package: "0805",
        description: "CC2 pull-down",
        pins: [
          { id: "1", name: "A", type: "passive" },
          { id: "2", name: "B", type: "passive" },
        ],
        schematicPosition: { x: 0, y: 0, rotation: 0 },
        pcbPosition: { x: 15, y: 20, rotation: 0 },
      },
      {
        ref: "R3",
        type: "resistor",
        value: "150",
        package: "0805",
        description: "LED current limiter",
        pins: [
          { id: "1", name: "A", type: "passive" },
          { id: "2", name: "B", type: "passive" },
        ],
        schematicPosition: { x: 0, y: 0, rotation: 0 },
        pcbPosition: { x: 25, y: 15, rotation: 0 },
      },
      {
        ref: "D1",
        type: "led",
        value: "Red LED",
        package: "0805",
        description: "LED",
        pins: [
          { id: "1", name: "Anode", type: "passive" },
          { id: "2", name: "Cathode", type: "passive" },
        ],
        schematicPosition: { x: 0, y: 0, rotation: 0 },
        pcbPosition: { x: 33, y: 15, rotation: 0 },
      },
    ],
    connections: [
      { netName: "VBUS", pins: [{ ref: "J1", pin: "VBUS" }, { ref: "R3", pin: "1" }] },
      { netName: "LED_A", pins: [{ ref: "R3", pin: "2" }, { ref: "D1", pin: "1" }] },
      { netName: "GND", pins: [{ ref: "D1", pin: "2" }, { ref: "J1", pin: "GND" }, { ref: "R1", pin: "2" }, { ref: "R2", pin: "2" }] },
      { netName: "CC1", pins: [{ ref: "J1", pin: "CC1" }, { ref: "R1", pin: "1" }] },
      { netName: "CC2", pins: [{ ref: "J1", pin: "CC2" }, { ref: "R2", pin: "1" }] },
    ],
    board: { width: 40, height: 30, layers: 2, cornerRadius: 1 },
    notes: [],
  };
}

describe("routeDesign — USB-C at board edge", () => {
  it("routes all nets including USB-C connector at left edge", () => {
    const design = makeUsbcLedCircuit();
    const result = routeDesign(design);

    expect(result.stats.failedNets).toBe(0);
    expect(result.failures.length).toBe(0);
    expect(result.stats.routedNets).toBe(5);

    for (const trace of result.traces) {
      expect(trace.points.length).toBeGreaterThanOrEqual(2);
      for (const pt of trace.points) {
        expect(pt.x).toBeGreaterThanOrEqual(0);
        expect(pt.x).toBeLessThanOrEqual(40);
        expect(pt.y).toBeGreaterThanOrEqual(0);
        expect(pt.y).toBeLessThanOrEqual(30);
      }
    }
  });
});
