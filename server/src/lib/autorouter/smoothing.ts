import type { GridPoint } from "./types.js";
import type { Trace, TracePoint } from "../../../../src/types/circuit.js";
import { toBoardCoord } from "./types.js";

interface PadSnap {
  start: { x: number; y: number };
  end: { x: number; y: number };
}

/**
 * Convert a cell-by-cell grid path (from A*) into a minimal-waypoint
 * polyline suitable for PCB traces.
 *
 * Algorithm:
 * 1. Walk the grid path from start to end
 * 2. Track the current direction vector (dx, dy)
 * 3. When direction changes, emit the previous cell as a waypoint (bend point)
 * 4. Always emit first and last points
 * 5. Convert grid coords to board coords via toBoardCoord
 * 6. Optionally snap first/last points to exact pad center coordinates
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

  // Always emit first point
  waypoints.push({
    x: toBoardCoord(path[0].x, cellSize),
    y: toBoardCoord(path[0].y, cellSize),
  });

  let prevDx = path[1].x - path[0].x;
  let prevDy = path[1].y - path[0].y;

  for (let i = 2; i < path.length; i++) {
    const dx = path[i].x - path[i - 1].x;
    const dy = path[i].y - path[i - 1].y;

    if (dx !== prevDx || dy !== prevDy) {
      // Direction changed — emit the bend point
      waypoints.push({
        x: toBoardCoord(path[i - 1].x, cellSize),
        y: toBoardCoord(path[i - 1].y, cellSize),
      });
      prevDx = dx;
      prevDy = dy;
    }
  }

  // Always emit last point
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
