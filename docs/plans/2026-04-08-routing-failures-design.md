# Routing Failure Fixes — Connector KEEPOUT + User Feedback

**Date:** 2026-04-08
**Status:** Approved

## Problem

The A* autorouter fails to route nets connected to edge-placed connectors (USB-C, JST, barrel jack). USB-C pads at board edges fall inside the 2.0mm KEEPOUT zone. The escape corridor logic (GridBuilder step 7) rejects all directions because the destination cell is still inside KEEPOUT. Result: pads are isolated, A* can't reach them, nets fail silently.

Additionally, the frontend ignores routing failures — `src/services/reroute.ts` returns only `result.traces` and discards `result.failures`. Users see partial routing with no explanation.

## Root Causes

1. **KEEPOUT traps edge connector pads.** USB-C at x=3mm has VBUS pad at x=1.25mm → grid cell 5, inside KEEPOUT (cells 0-7). Pad carving clears 1 cell radius (0.25mm), but escape corridor logic rejects all directions because the destination is still in KEEPOUT.

2. **Escape corridor destination check is too strict.** It checks if one cell past the blocked zone is outside KEEPOUT. For edge connectors, this cell is always inside KEEPOUT, so no corridor is carved.

3. **Frontend discards failure data.** `rerouteTraces()` returns `result.traces as Trace[]`, ignoring `result.failures` and `result.stats`.

## Solution

### Part 1: Connector-Aware Pad Carving (GridBuilder)

Replace the fragile step 7 escape corridor logic with connector-aware pad carving in step 6:

- Build a set of connector component refs from design (`type === "connector"`)
- When carving pads for connector components, scan outward from the pad in the best cardinal direction (toward board interior) clearing KEEPOUT + BLOCKED_FRONT cells until reaching open routing space
- Corridor width matches max trace inflate (power traces: 2 cells on each side)
- Non-connector pads keep the standard 1-cell inflate radius
- Remove step 7 entirely — it's superseded by the connector-aware carving

### Part 2: Full Reroute Response (Service Layer)

Change `src/services/reroute.ts` to return the full response:

```typescript
export interface RerouteResult {
  traces: Trace[];
  failures: { net: string; from: string; to: string; reason: string }[];
  stats: { totalNets: number; routedNets: number; failedNets: number; timeMs: number };
}
```

Update `App.tsx` to store failures in state and pass to DesignViewer.

### Part 3: Failure Banner UI (DesignViewer)

Show routing results below the toolbar:

- **Success:** Green banner "Routed 5/5 nets in 12ms" — fades after 3s
- **Partial failure:** Amber banner "Routed 3/5 nets. 2 failed." with expandable details per net
- **Total failure:** Red banner "Routing failed — 0/5 nets routed."

Banner clears when user modifies design or starts new chat. Matches existing check-design panel styling.

## Files Changed

| File | Change |
|------|--------|
| `server/src/lib/autorouter/GridBuilder.ts` | Connector-aware pad carving, remove step 7 |
| `server/src/lib/autorouter/GridBuilder.test.ts` | Test connector edge routing |
| `src/services/reroute.ts` | Return full RerouteResult |
| `src/App.tsx` | Store routeResult state, pass to DesignViewer |
| `src/components/DesignViewer.tsx` | Render failure banner |
