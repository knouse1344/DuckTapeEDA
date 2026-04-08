import type { CircuitDesign, Trace } from "../../../../src/types/circuit.js";
import type { RouterResult, RouteFailure } from "./types.js";
import {
  CELL_SIZE,
  TRACE_WIDTH_SIGNAL,
  TRACE_WIDTH_POWER,
  toGridCoord,
} from "./types.js";
import { buildGrid, stampTrace } from "./GridBuilder.js";
import { findPath } from "./PathFinder.js";
import { orderNets, buildSpanningPairs, type PadLocation } from "./NetRouter.js";
import { gridPathToTrace } from "./smoothing.js";

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

export function routeDesign(design: CircuitDesign): RouterResult {
  const t0 = performance.now();

  const { grid, netIndex, padPositions } = buildGrid(design);
  const orderedNets = orderNets(design.connections);

  const traces: Trace[] = [];
  const failures: RouteFailure[] = [];
  let routedNets = 0;

  for (const conn of orderedNets) {
    const netId = netIndex.get(conn.netName);
    if (netId === undefined) continue;

    const width = traceWidthForNet(conn);
    const inflate = Math.ceil((width / CELL_SIZE) / 2);

    const netPads: PadLocation[] = [];
    for (const pin of conn.pins) {
      const key = `${pin.ref}.${pin.pin}`;
      const pos = padPositions.get(key);
      if (pos) {
        netPads.push({ key, x: pos.x, y: pos.y });
      }
    }

    if (netPads.length < 2) continue;

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

      if (result.found && result.path.length >= 2) {
        stampTrace(grid, result.path, netId, inflate);

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
      } else if (result.found && result.path.length < 2) {
        // Degenerate case: start and end map to the same grid cell.
        // Treat as a zero-length trace (pads overlap).
        stampTrace(grid, result.path, netId, inflate);
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
      failedNets: design.connections.length - routedNets,
      timeMs: Math.round(performance.now() - t0),
    },
  };
}
