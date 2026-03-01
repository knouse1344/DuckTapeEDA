# AI Trace Routing — Design Document

## Problem

DuckTape EDA generates PCB designs with component placement and logical connections (nets), but no copper traces. The exported KiCad file has components placed with net assignments but zero routing — users must open KiCad and route manually. For non-electrical engineers, this kills the workflow. Simple boards like the OWL LED board (2 components, ~4 nets) should be fully routed by AI.

## Solution

Claude AI generates trace routes as part of the same design response that produces components and connections. Routes are polyline waypoints in the CircuitDesign JSON. A server-side DRC validator checks the routes; if invalid, Claude fixes them in a retry loop (max 3 attempts). The PCB editor renders traces as colored SVG polylines and the KiCad exporter emits `(segment ...)` S-expressions.

## Data Model

Two new types in `circuit.ts`:

```typescript
interface TracePoint {
  x: number;   // mm, absolute board coordinate
  y: number;   // mm, absolute board coordinate
}

interface Trace {
  netName: string;       // must match a Connection.netName
  width: number;         // mm (0.25 signal, 0.5 power)
  layer: "front";        // v1: front copper only
  points: TracePoint[];  // polyline waypoints (>=2 points)
}
```

`CircuitDesign` gets one new optional field:

```typescript
traces?: Trace[];
```

### Trace Topology

- Each `Trace` connects two pads on the same net (pad-to-pad)
- A net with N pads gets N-1 trace entries (spanning tree, not star)
- First point starts at a pad center, last point ends at a pad center
- Intermediate points are bend waypoints (45 or 90 degree bends)
- `traces` is optional — designs without routing remain backward compatible

## AI Prompt Engineering

The server-side prompt (`buildPrompt.ts`) is extended with:

1. **Pad position table** — Computed server-side from padLibrary + pcbPosition. Claude receives exact absolute coordinates for every pad:
   ```
   Pad positions for routing:
     J1.VBUS  -> (3.0, 6.0)
     J1.GND   -> (3.0, 8.0)
     LED1.VDD -> (20.0, 5.0)
     LED1.VSS -> (20.0, 9.0)
   ```

2. **Routing rules** — Trace widths (0.25mm signal, 0.5mm power), minimum clearance (0.2mm), stay within board bounds, 45/90 degree bends only, front copper layer only.

3. **Worked example** — A simple 2-component board with the expected trace JSON output.

### Validation Fix Loop

```
1. Claude generates design JSON (components + connections + traces)
2. Server validates everything:
   - Existing checks (placement, electrical rules)
   - NEW: route validation (DRC)
3. If route violations found:
   -> Send specific errors back to Claude with coordinates
   -> Claude fixes and resubmits (max 3 attempts)
4. If still invalid after 3 tries:
   -> Accept design WITHOUT traces
   -> User sees rat's nest in PCB view
   -> User routes in KiCad after export
```

## Route Validation (DRC)

New server-side function `validateRoutes()` checks:

### Geometry Checks
- Every trace segment stays within board bounds (0 to board.width, 0 to board.height)
- First/last point of each trace lands on the correct pad (within 0.1mm tolerance)
- All points are valid numbers, no NaN/Infinity

### Clearance Checks
- Trace-to-trace clearance: minimum 0.2mm between segments on different nets
- Trace-to-pad clearance: minimum 0.2mm between a trace and any pad not on the same net
- No same-net traces overlap (redundant copper)

### Connectivity Checks
- Every connection in `connections[]` has corresponding traces spanning all its pads
- Each trace's `netName` matches an existing connection
- Trace `width` meets minimums (0.25mm signal, 0.5mm power)

### Error Format (Sent to Claude)
```
ROUTE_CLEARANCE: Trace "VBUS" seg 2-3 is 0.12mm from trace "GND" seg 1-2 near (8.5, 6.0). Min: 0.2mm.
ROUTE_UNCONNECTED: Net "DIN" has no trace connecting LED1.DIN to U1.DOUT.
ROUTE_OUT_OF_BOUNDS: Trace "GND" point 3 at (-1.0, 5.0) is outside board.
```

### Deliberately Skipped in v1
- Trace-to-board-edge clearance
- Trace-to-component-body clearance (keepout zone intersection)
- Annular ring checks (no vias in v1)
- Impedance / high-speed signal rules

## PCB Editor Visualization

Two new SVG layers in `PcbLayoutEditor.tsx`:

### Routed Traces
- Solid colored SVG `<polyline>` elements
- Width matches `trace.width` (scaled to SVG coordinates)
- Color per net (cycle through palette: red, blue, green, orange, etc.)
- Pad endpoints shown as filled circles at trace start/end

### Rat's Nest Lines
- Thin dashed gray lines connecting pad centers that share a net but have no trace
- Visible when routing is partial or absent
- Helps users see what still needs routing

### Render Order (bottom to top)
1. Board outline (green rectangle)
2. Routed traces (colored polylines)
3. Rat's nest lines (dashed gray)
4. Component footprints (rectangles with ref labels)

No interactivity in v1 — traces are display-only.

## KiCad Export Integration

Each `Trace` with N points becomes N-1 KiCad `(segment ...)` entries:

```
(segment (start 3.0 6.0) (end 10.0 6.0) (width 0.5) (layer "F.Cu") (net 1) (uuid "..."))
```

- Net ordinal from existing `buildNetMap()` function
- Layer mapping: `"front"` -> `"F.Cu"`
- Added to output after footprints, before closing parenthesis

BOM and CPL exports are unaffected by traces.

## Files Changed

| File | Change |
|------|--------|
| `src/types/circuit.ts` | Add `Trace`, `TracePoint` interfaces |
| `server/src/lib/buildPrompt.ts` | Add routing instructions, pad position table, worked example |
| `server/src/lib/validateDesign.ts` | Add `validateRoutes()` DRC function |
| `server/src/routes/chat.ts` | Compute pad positions, include in prompt, handle route validation in fix loop |
| `src/components/PcbLayoutEditor.tsx` | Render traces (polylines) + rat's nest (dashed lines) |
| `src/lib/exportKicad.ts` | Emit `(segment ...)` entries from trace data |

### Unchanged
- `src/lib/padLibrary.ts` — Read-only consumer, no changes
- `src/lib/footprintLookup.ts` — Read-only consumer, no changes
- `src/lib/exportBom.ts` — Not affected by traces
- `src/lib/exportCpl.ts` — Not affected by traces

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Router | Claude AI | Aligns with vision of AI progressively replacing KiCad |
| Data model | Polyline (points array) | Less verbose than segments, no redundancy, natural for AI |
| Scope (v1) | Single-layer, no vias, <=10 components | Realistic for Claude today, covers OWL LED board |
| Validation | Fix loop, max 3 attempts | Same pattern as existing design validation |
| Fallback | Accept without traces | Graceful degradation — user routes in KiCad |
| Timing | Same AI call | Simplest flow — user gets fully routed board from chat |
| Pad positions | Computed server-side, injected into prompt | Minimizes AI coordinate errors |
| Visualization | Display-only SVG | Interactive editing is separate future feature |

## Scope Boundaries (NOT Included)

- No back-layer routing or vias
- No interactive trace editing (display only)
- No ground planes / copper pours
- No trace-to-component-body clearance checking
- No impedance or high-speed signal rules
- No differential pair routing
