# Routing Failure Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix autorouter failures for edge-placed connectors and show users actionable routing feedback.

**Architecture:** Three changes — (1) rewrite GridBuilder pad carving to handle connector pads in KEEPOUT zones, (2) plumb full routing results through the service layer, (3) add failure banner UI to DesignViewer.

**Tech Stack:** TypeScript, vitest (server tests), React + Tailwind (frontend)

**Design doc:** `docs/plans/2026-04-08-routing-failures-design.md`

---

### Task 1: Rewrite GridBuilder Pad Carving for Edge Connectors

**Files:**
- Modify: `server/src/lib/autorouter/GridBuilder.ts:90-208`
- Modify: `server/src/lib/autorouter/GridBuilder.test.ts`

**Step 1: Write the failing test**

Add to `server/src/lib/autorouter/GridBuilder.test.ts`:

```typescript
describe("buildGrid — edge connector pad carving", () => {
  it("carves connector pads through KEEPOUT zone to open space", () => {
    // USB-C at left edge: pads should be reachable despite being in KEEPOUT
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

    // The VBUS pad at absolute ~(1.25, 7.0) is inside the 2mm KEEPOUT zone.
    // After connector-aware carving, there must be a continuous path of
    // non-KEEPOUT, non-BLOCKED cells from the pad to open routing space.
    const vbusPadGx = toGridCoord(1.25, 0.25); // grid cell ~5
    const vbusPadGy = toGridCoord(7.0, 0.25);  // grid cell ~28

    // Pad cell itself should be carved (PAD flag, no KEEPOUT, no BLOCKED)
    expect(hasFlag(grid, vbusPadGx, vbusPadGy, CellFlag.PAD)).toBe(true);
    expect(hasFlag(grid, vbusPadGx, vbusPadGy, CellFlag.KEEPOUT)).toBe(false);
    expect(hasFlag(grid, vbusPadGx, vbusPadGy, CellFlag.BLOCKED_FRONT)).toBe(false);

    // There must be a corridor of clear cells from the pad to past the
    // KEEPOUT zone (cell 8 = 2.0mm). Scan rightward from pad.
    const marginCells = Math.ceil(2.0 / 0.25); // 8
    let reachedOpen = false;
    for (let gx = vbusPadGx; gx <= marginCells + 2; gx++) {
      if (
        !hasFlag(grid, gx, vbusPadGy, CellFlag.KEEPOUT) &&
        !hasFlag(grid, gx, vbusPadGy, CellFlag.BLOCKED_FRONT)
      ) {
        if (gx >= marginCells) {
          reachedOpen = true;
          break;
        }
      }
    }
    expect(reachedOpen).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/lib/autorouter/GridBuilder.test.ts`
Expected: FAIL — the corridor doesn't reach through KEEPOUT for edge connector pads.

**Step 3: Rewrite steps 6 and 7 in GridBuilder.ts**

Replace lines 90-208 (steps 6 and 7) with the new connector-aware pad carving. The key changes:

1. Build a set of connector refs: `const connectorRefs = new Set(design.components.filter(c => c.type === "connector").map(c => c.ref))`
2. In the pad carving loop, check if the pad belongs to a connector
3. For connector pads: after the standard 1-cell carving, scan outward toward the board interior (rightward from left edge, leftward from right edge, etc.) clearing KEEPOUT + BLOCKED_FRONT until reaching a cell that's past the KEEPOUT zone. Corridor width = `padInflate + maxTraceInflate` on each side.
4. For non-connector pads: keep the existing 1-cell inflate carving plus the existing escape corridor logic (step 7) for pads deep inside large IC footprints.

The connector corridor logic:

```typescript
// For connector pads: carve corridor to board interior past KEEPOUT
if (isConnector) {
  const marginCells = Math.ceil(BOARD_MARGIN / CELL_SIZE);
  const maxTraceInflate = Math.ceil((TRACE_WIDTH_POWER / CELL_SIZE) / 2);
  const corridorHalf = padInflate + maxTraceInflate;

  // Determine which edge the connector is near and scan toward interior
  const boardCenterX = grid.cols / 2;
  const boardCenterY = grid.rows / 2;
  const dx = boardCenterX - cx > 0 ? 1 : -1; // toward center horizontally
  const dy = boardCenterY - cy > 0 ? 1 : -1; // toward center vertically

  // Pick primary escape direction: horizontal if closer to left/right edge,
  // vertical if closer to top/bottom edge
  const distToEdgeX = Math.min(cx, grid.cols - 1 - cx);
  const distToEdgeY = Math.min(cy, grid.rows - 1 - cy);

  if (distToEdgeX <= distToEdgeY) {
    // Escape horizontally toward board center
    const targetX = dx > 0 ? marginCells + corridorHalf + 1 : grid.cols - marginCells - corridorHalf - 2;
    const startX = Math.min(cx, targetX);
    const endX = Math.max(cx, targetX);
    for (let gx = startX; gx <= endX; gx++) {
      for (let d = -corridorHalf; d <= corridorHalf; d++) {
        const gy = cy + d;
        if (gx < 0 || gx >= grid.cols || gy < 0 || gy >= grid.rows) continue;
        clearCell(grid, gx, gy, CellFlag.BLOCKED_FRONT);
        clearCell(grid, gx, gy, CellFlag.KEEPOUT);
      }
    }
  } else {
    // Escape vertically toward board center
    const targetY = dy > 0 ? marginCells + corridorHalf + 1 : grid.rows - marginCells - corridorHalf - 2;
    const startY = Math.min(cy, targetY);
    const endY = Math.max(cy, targetY);
    for (let gy = startY; gy <= endY; gy++) {
      for (let d = -corridorHalf; d <= corridorHalf; d++) {
        const gx = cx + d;
        if (gx < 0 || gx >= grid.cols || gy < 0 || gy >= grid.rows) continue;
        clearCell(grid, gx, gy, CellFlag.BLOCKED_FRONT);
        clearCell(grid, gx, gy, CellFlag.KEEPOUT);
      }
    }
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run src/lib/autorouter/`
Expected: All tests PASS including the new edge connector test.

**Step 5: Commit**

```bash
git add server/src/lib/autorouter/GridBuilder.ts server/src/lib/autorouter/GridBuilder.test.ts
git commit -m "fix(autorouter): connector-aware pad carving through KEEPOUT zone"
```

---

### Task 2: Add End-to-End USB-C Routing Test

**Files:**
- Modify: `server/src/lib/autorouter/index.test.ts`

**Step 1: Write the failing test**

Add a new test to `server/src/lib/autorouter/index.test.ts` that routes a USB-C LED circuit where the USB-C is at the board edge:

```typescript
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
    expect(result.stats.routedNets).toBe(5); // VBUS, LED_A, GND, CC1, CC2

    // Every trace should have valid points within board
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
```

**Step 2: Run test to verify it passes** (should pass after Task 1 fix)

Run: `cd server && npx vitest run src/lib/autorouter/index.test.ts`
Expected: All tests PASS.

**Step 3: Commit**

```bash
git add server/src/lib/autorouter/index.test.ts
git commit -m "test(autorouter): add USB-C edge connector end-to-end routing test"
```

---

### Task 3: Return Full Reroute Result from Service Layer

**Files:**
- Modify: `src/services/reroute.ts`

**Step 1: Update the service to return full result**

Replace `src/services/reroute.ts` contents:

```typescript
import type { CircuitDesign, Trace } from "../types/circuit";

export interface RouteFailure {
  net: string;
  from: string;
  to: string;
  reason: string;
}

export interface RouteStats {
  totalNets: number;
  routedNets: number;
  failedNets: number;
  timeMs: number;
}

export interface RerouteResult {
  traces: Trace[];
  failures: RouteFailure[];
  stats: RouteStats;
}

export async function rerouteTraces(
  token: string,
  design: CircuitDesign,
): Promise<RerouteResult> {
  const response = await fetch("/api/reroute", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ design }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const message =
      (error as { error?: string })?.error || `API error: ${response.status}`;
    throw new Error(message);
  }

  const result = await response.json();
  return {
    traces: result.traces ?? [],
    failures: result.failures ?? [],
    stats: result.stats ?? { totalNets: 0, routedNets: 0, failedNets: 0, timeMs: 0 },
  };
}
```

**Step 2: Verify frontend builds**

Run: `cd c:/Users/bryan/Desktop/DuckTapeEDA && npx tsc -b`
Expected: Build errors in App.tsx because `rerouteTraces` return type changed. That's expected — we fix it in Task 4.

**Step 3: Commit**

```bash
git add src/services/reroute.ts
git commit -m "feat: return full routing result (traces + failures + stats) from reroute service"
```

---

### Task 4: Plumb Route Result Through App.tsx

**Files:**
- Modify: `src/App.tsx`

**Step 1: Add routeResult state and update handleReroute**

In App.tsx, near the other state declarations (around line 30-40), add:

```typescript
import type { RerouteResult } from "./services/reroute";

// Near other useState declarations:
const [routeResult, setRouteResult] = useState<RerouteResult | null>(null);
```

Update `handleReroute` (currently at line 227):

```typescript
const handleReroute = async () => {
  if (!token || !currentDesign) return;
  setRerouting(true);
  setRouteResult(null);
  try {
    const result = await rerouteTraces(token, currentDesign);
    setRouteResult(result);
    const updatedDesign = { ...currentDesign, traces: result.traces };
    setCurrentDesign(updatedDesign);
    if (currentDesignId) {
      await updateDesign(token, currentDesignId, updatedDesign, messages);
      setDrawerRefreshKey(k => k + 1);
    }
  } catch (err) {
    console.error("Re-route failed:", err);
  } finally {
    setRerouting(false);
  }
};
```

Clear routeResult when design changes — add to `handleUpdatePosition` and wherever `setCurrentDesign` is called to modify the design:

```typescript
// In handleUpdatePosition, after setCurrentDesign:
setRouteResult(null);
```

Pass routeResult to DesignViewer:

```tsx
<DesignViewer
  design={currentDesign}
  // ... existing props ...
  onReroute={handleReroute}
  rerouting={rerouting}
  routeResult={routeResult}
/>
```

**Step 2: Verify frontend builds**

Run: `cd c:/Users/bryan/Desktop/DuckTapeEDA && npx tsc -b`
Expected: May have error because DesignViewer doesn't accept `routeResult` prop yet — that's fine, fixed in Task 5.

**Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: plumb routeResult state through App.tsx to DesignViewer"
```

---

### Task 5: Add Failure Banner to DesignViewer

**Files:**
- Modify: `src/components/DesignViewer.tsx`

**Step 1: Add routeResult to Props interface**

At `src/components/DesignViewer.tsx`, update the Props interface (line 10):

```typescript
import type { RerouteResult } from "../services/reroute";

interface Props {
  design: CircuitDesign | null;
  onCheckDesign?: () => void;
  checking?: boolean;
  checkFindings?: CheckFinding[];
  checkAiText?: string;
  onCloseCheck?: () => void;
  onUpdatePosition?: (ref: string, x: number, y: number, rotation: number) => void;
  onReroute?: () => void;
  rerouting?: boolean;
  routeResult?: RerouteResult | null;
}
```

Add `routeResult` to the destructured props.

**Step 2: Add the banner component inline**

Below the toolbar buttons section (after the closing `</div>` of the button row, around line 170), add the routing result banner:

```tsx
{/* Routing result banner */}
{routeResult && !rerouting && (
  <div className={`mx-4 mt-2 px-3 py-2 rounded text-sm ${
    routeResult.stats.failedNets === 0
      ? "bg-green-50 text-green-700 border border-green-200"
      : routeResult.stats.routedNets === 0
        ? "bg-red-50 text-red-700 border border-red-200"
        : "bg-amber-50 text-amber-700 border border-amber-200"
  }`}>
    {routeResult.stats.failedNets === 0 ? (
      <span>Routed {routeResult.stats.routedNets}/{routeResult.stats.totalNets} nets in {routeResult.stats.timeMs}ms</span>
    ) : (
      <div>
        <span className="font-medium">
          Routed {routeResult.stats.routedNets}/{routeResult.stats.totalNets} nets.
          {" "}{routeResult.stats.failedNets} failed.
        </span>
        {routeResult.failures.length > 0 && (
          <ul className="mt-1 text-xs space-y-0.5">
            {routeResult.failures.map((f, i) => (
              <li key={i}>{f.net}: no path {f.from} to {f.to}</li>
            ))}
          </ul>
        )}
      </div>
    )}
  </div>
)}
```

**Step 3: Verify full build passes**

Run: `cd c:/Users/bryan/Desktop/DuckTapeEDA && npm run build`
Expected: Clean build, zero errors.

**Step 4: Commit**

```bash
git add src/components/DesignViewer.tsx
git commit -m "feat: add routing result banner showing success/failure per net"
```

---

### Task 6: Full Verification

**Step 1: Run all autorouter tests**

Run: `cd server && npx vitest run src/lib/autorouter/`
Expected: All tests PASS (including new edge connector and USB-C tests).

**Step 2: Run full build**

Run: `cd c:/Users/bryan/Desktop/DuckTapeEDA && npm run build`
Expected: Clean build.

**Step 3: Commit and push**

```bash
git push
```
