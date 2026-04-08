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
