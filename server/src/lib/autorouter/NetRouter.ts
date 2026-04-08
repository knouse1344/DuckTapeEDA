import type { Connection } from "../../types/circuit.js";

/* ── Power-net detection ─────────────────────────────────────── */

const POWER_NET_NAMES = new Set([
  "GND", "VCC", "VBUS", "VDD", "V+", "V-",
  "3V3", "3.3V", "5V", "12V",
]);

function isPowerNet(name: string): boolean {
  return POWER_NET_NAMES.has(name) || name.toUpperCase().startsWith("V");
}

/* ── Net ordering ────────────────────────────────────────────── */

/**
 * Order nets for routing priority:
 *  1. Power nets first (GND, VBUS, VCC, VDD, 3V3, 5V, 12V, etc.)
 *  2. Then by pin count ascending (fewer pins = simpler = route first)
 *  3. Then alphabetical by net name for determinism
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

/* ── Spanning-tree decomposition ─────────────────────────────── */

export interface PadLocation {
  key: string;
  x: number;
  y: number;
}

export interface PadPair {
  from: PadLocation;
  to: PadLocation;
}

/**
 * Build a nearest-neighbour spanning tree over the pads.
 * Returns N-1 pad pairs for N pads — each pair becomes one
 * PathFinder A* call during routing.
 *
 * Algorithm:
 *  1. Start with the first pad as the "connected" set.
 *  2. Find the unconnected pad nearest to any connected pad.
 *  3. Add the pair (connected, unconnected) to the result.
 *  4. Move that pad into the connected set.
 *  5. Repeat until all pads are connected.
 */
export function buildSpanningPairs(pads: PadLocation[]): PadPair[] {
  if (pads.length < 2) return [];

  const pairs: PadPair[] = [];
  const connected = new Set<number>([0]);
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
