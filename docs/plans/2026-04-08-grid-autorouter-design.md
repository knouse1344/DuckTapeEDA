# Grid-Based A* Autorouter Design

**Date:** 2026-04-08
**Status:** Approved
**Replaces:** AI-based trace routing (Claude prompt → polyline guesses)

## Problem

The current trace routing system asks Claude to generate polyline routes, then validates clearance/bounds/connectivity. This approach has no obstacle avoidance against component footprints, is non-deterministic, and produces invalid routes that require retry loops. For real PCB manufacturing, we need routes that are correct by construction.

## Solution

A grid-based A* autorouter that discretizes the board into a 0.25mm cell grid, stamps component footprints as obstacles, and finds shortest paths between pads using 8-directional A* search. Routes are guaranteed to avoid obstacles, maintain clearance, and stay within board bounds.

## Design Decisions

- **Grid-based A* over visibility graph or hybrid approach** — simpler, well-understood, naturally extends to multi-layer/vias
- **Front-layer only (v1)** — matches current app behavior; data structures reserve bits for back layer
- **0.25mm cell size** — matches minimum trace width, gives ~10 cells between DIP pins (2.54mm pitch)
- **Drop-in replacement** — output is the same `Trace[]` format, zero downstream changes needed
- **Keep Claude for circuit design** — only trace routing is replaced; AI still picks components and places them

## Architecture

### Module Structure

```
server/src/lib/autorouter/
  index.ts          — Public API: routeDesign(design) → RouterResult
  GridBuilder.ts    — Board + components → obstacle grid
  PathFinder.ts     — A* implementation: find path between two points
  NetRouter.ts      — Net ordering, multi-pin decomposition, orchestration
  types.ts          — Grid types, cell flags, result types
  smoothing.ts      — Grid paths → clean polylines with pad snapping
```

### Data Flow

```
Design (components, connections, board)
  → GridBuilder (stamp footprints, pads, clearance zones)
  → NetRouter (order nets, decompose multi-pin nets into pad pairs)
  → PathFinder (A* per pad pair, 8-directional movement)
  → smoothing (collapse grid paths to minimal waypoints, snap to pad centers)
  → Trace[] (same format the app already uses)
```

### Grid Representation

Single `Uint8Array` with bit flags per cell:

| Bit | Flag | Purpose |
|-----|------|---------|
| 0 | BLOCKED_FRONT | Obstacle on front copper |
| 1 | BLOCKED_BACK | Reserved for future back layer |
| 2 | TRACE_FRONT | Routed trace occupies cell (front) |
| 3 | TRACE_BACK | Reserved for future back layer traces |
| 4 | PAD | Pad location (routable for its own net) |
| 5 | VIA | Reserved for future via support |
| 6 | KEEPOUT | Unconditional no-go zone (board margin) |
| 7 | (unused) | Free for future use |

Parallel `Int16Array` netMap tracks which net owns each cell. Cells owned by net N are obstacles for net M != N, but passable for net N.

### Memory Budget

| Board Size | Grid Cells | Memory (cells + netMap) |
|-----------|-----------|------------------------|
| 50x50mm | 40K | ~120 KB |
| 100x100mm | 160K | ~480 KB |
| 300x300mm | 1.4M | ~4.2 MB |

Future optimizations (adaptive resolution, sparse grids) can reduce this further if needed.

### GridBuilder — Obstacle Stamping

Stamping order:
1. Initialize all cells to 0x00, netMap to -1
2. Stamp board edge KEEPOUT (2.0mm margin)
3. Stamp component footprints as BLOCKED_FRONT (inflated by 0.2mm trace clearance)
4. Stamp pads — overwrite BLOCKED_FRONT with PAD flag + net ID (pads punch through parent footprint)

Uses existing `getComponentBounds()` from `footprintTable.ts` and `computePadPositions()` from `padPositions.ts`.

### PathFinder — A* Search

- 8-directional movement (orthogonal cost 1.0, diagonal cost 1.414)
- Octile distance heuristic (admissible, guarantees shortest path)
- Trace width handled via inflation: passability checked in a square around each candidate cell sized to the trace width
- Binary heap priority queue

Cell passability for net N:
- NOT flagged KEEPOUT
- NOT flagged BLOCKED_FRONT (unless PAD for net N)
- netMap[cell] == -1 OR netMap[cell] == N

### NetRouter — Orchestration

Net ordering (v1):
1. Power nets first (GND, VBUS, VCC) — wide traces need first pick of space
2. Then by pin count ascending — simple nets first
3. Ties broken by net name (deterministic)

Multi-pin net decomposition: nearest-neighbor spanning tree
1. Start with any pad in the connected set
2. Find unconnected pad nearest to any connected pad
3. Route that pair via PathFinder
4. Add to connected set, stamp trace cells onto grid
5. Repeat until all pads connected

### Smoothing — Grid Path to Polyline

1. Walk grid path, detect direction changes
2. Emit waypoint at each direction change
3. Snap first/last waypoints to exact pad center coordinates
4. Output: standard `Trace` object with minimal waypoints

### Integration

One change: in `server/src/routes/reroute.ts`, replace Claude API call with `routeDesign(design)`.

Everything downstream stays untouched:
- `validateRoutes()` runs as safety net
- `PcbLayoutEditor.tsx` renders traces as before
- `exportKicad.ts` exports traces as before
- Chat flow / Claude design generation unchanged

### Error Handling

```typescript
interface RouterResult {
  traces: Trace[];
  failures: RouteFailure[];
  stats: { totalNets: number; routedNets: number; failedNets: number; timeMs: number; }
}

interface RouteFailure {
  net: string;
  from: string;  // "U1.GND"
  to: string;    // "C1.2"
  reason: "no_path" | "out_of_bounds";
}
```

Partial failures return successful traces + explicit failure messages. Frontend shows actionable guidance ("try repositioning components closer together").

## Future Evolution Path (Option C)

All enhancements are additive — same architecture, no rewrites:

| Enhancement | Module Changed | What Changes |
|-------------|---------------|-------------|
| Back-layer routing + vias | GridBuilder, PathFinder | Grid gains Z dimension, A* gains layer-transition moves |
| Ripup-and-retry | NetRouter | On failure, unroute blocking net, try different order |
| Steiner tree optimization | NetRouter | Better multi-pin decomposition |
| Adaptive grid resolution | GridBuilder | Fine grid near ICs, coarse in open areas |
| Sparse grid | types.ts, GridBuilder | Only allocate visited/blocked cells |
| Net ordering heuristics | NetRouter | Congestion estimation, constraint-based ordering |

## Constants

| Constant | Value | Notes |
|----------|-------|-------|
| CELL_SIZE | 0.25 mm | Grid resolution |
| BOARD_MARGIN | 2.0 mm | Keepout from board edges |
| TRACE_CLEARANCE | 0.2 mm | Min gap between different nets |
| TRACE_WIDTH_SIGNAL | 0.25 mm | Default signal trace |
| TRACE_WIDTH_POWER | 0.5 mm | Default power trace |
| MOVE_COST_ORTHOGONAL | 1.0 | N/S/E/W step cost |
| MOVE_COST_DIAGONAL | 1.414 | NE/NW/SE/SW step cost |
