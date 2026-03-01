# AI Trace Routing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Claude AI generates copper trace routes as part of the PCB design, validated by server-side DRC, rendered in the PCB editor, and exported as KiCad segments.

**Architecture:** Claude generates polyline traces in the same design JSON response. Server computes pad absolute positions and injects them into the prompt. A new `validateRoutes()` DRC function checks geometry, clearance, and connectivity. Invalid routes trigger a fix loop (max 3 retries). The PCB editor renders traces as SVG polylines and unrouted nets as dashed rat's nest lines. The KiCad exporter converts polylines to `(segment ...)` S-expressions.

**Tech Stack:** TypeScript, Express, Claude API (Sonnet 4), SVG, KiCad 8 S-expression format

---

### Task 1: Data Model — Add Trace and TracePoint Types

**Files:**
- Modify: `src/types/circuit.ts:91` (after PadDef interface)

**Step 1: Add TracePoint and Trace interfaces**

Add after the `PadDef` interface (line 91) and before `ChatMessage` (line 93):

```typescript
/** A waypoint in a copper trace polyline */
export interface TracePoint {
  /** X coordinate in mm (absolute board position) */
  x: number;
  /** Y coordinate in mm (absolute board position) */
  y: number;
}

/** A routed copper trace connecting two pads on the same net */
export interface Trace {
  /** Must match a Connection.netName */
  netName: string;
  /** Trace width in mm (0.25 signal, 0.5 power) */
  width: number;
  /** Copper layer — v1 supports front only */
  layer: "front";
  /** Polyline waypoints — first point at source pad, last at destination pad */
  points: TracePoint[];
}
```

**Step 2: Add traces field to CircuitDesign**

Add `traces?: Trace[];` to the `CircuitDesign` interface, after `branding?`:

```typescript
export interface CircuitDesign {
  name: string;
  description: string;
  components: Component[];
  connections: Connection[];
  board: BoardSpec;
  notes: string[];
  branding?: BrandingBlock;
  traces?: Trace[];
}
```

**Step 3: Commit**

```bash
git add src/types/circuit.ts
git commit -m "feat: add Trace and TracePoint types to CircuitDesign"
```

---

### Task 2: Server-Side Pad Position Computation

The server needs to compute absolute pad positions (component position + pad offset with rotation) so it can:
1. Inject a pad position table into the AI prompt
2. Validate that traces start/end at correct pad locations

**Files:**
- Create: `server/src/lib/padPositions.ts`

**Step 1: Create the pad position computation module**

This module imports the client-side padLibrary data and computes absolute pad positions from a design. Since the server can't import from `src/lib/`, we need to duplicate the pad lookup function. However, to keep the plan simple and avoid a massive copy, we'll create a focused utility that re-exports pad data through a dynamic import mechanism.

Actually, the simplest approach: create a focused utility that computes absolute pad positions given a design. It needs access to pad definitions — we'll copy just the `getPads` function and the `PACKAGE_PADS` data to the server.

```typescript
/**
 * Pad Position Computation
 *
 * Computes absolute pad positions for all components in a design.
 * Used by:
 * 1. buildPrompt.ts — inject pad positions into AI routing prompt
 * 2. validateDesign.ts — verify traces connect to correct pad locations
 */

// ── Pad geometry data (mirrors src/lib/padLibrary.ts) ──

interface PadDef {
  id: string;
  x: number;
  y: number;
  shape: "circle" | "rect" | "oval";
  width: number;
  height: number;
  drill?: number;
  layer: "front" | "back" | "through";
}

// ── Parametric generators ──

function dipPads(pinCount: number): PadDef[] {
  const pads: PadDef[] = [];
  const rows = pinCount / 2;
  const pitch = 2.54;
  const rowSpacing = 7.62;
  const yOffset = ((rows - 1) * pitch) / 2;
  for (let i = 0; i < rows; i++) {
    const pinNum = i + 1;
    pads.push({
      id: String(pinNum), x: -rowSpacing / 2, y: -yOffset + i * pitch,
      shape: pinNum === 1 ? "rect" : "circle", width: 1.6, height: 1.6, drill: 0.8, layer: "through",
    });
  }
  for (let i = rows - 1; i >= 0; i--) {
    const pinNum = pinCount - i;
    pads.push({
      id: String(pinNum), x: rowSpacing / 2, y: -yOffset + i * pitch,
      shape: "circle", width: 1.6, height: 1.6, drill: 0.8, layer: "through",
    });
  }
  return pads;
}

function pinHeaderPads(pinCount: number): PadDef[] {
  const pads: PadDef[] = [];
  const pitch = 2.54;
  const yOffset = ((pinCount - 1) * pitch) / 2;
  for (let i = 0; i < pinCount; i++) {
    pads.push({
      id: String(i + 1), x: 0, y: -yOffset + i * pitch,
      shape: i === 0 ? "rect" : "circle", width: 1.7, height: 1.7, drill: 1.0, layer: "through",
    });
  }
  return pads;
}

function jstPhPads(pinCount: number): PadDef[] {
  const pads: PadDef[] = [];
  const pitch = 2.0;
  const xOffset = ((pinCount - 1) * pitch) / 2;
  for (let i = 0; i < pinCount; i++) {
    pads.push({
      id: String(i + 1), x: -xOffset + i * pitch, y: 0,
      shape: i === 0 ? "rect" : "circle", width: 1.2, height: 1.2, drill: 0.7, layer: "through",
    });
  }
  return pads;
}

function screwTerminalPads(pinCount: number): PadDef[] {
  const pads: PadDef[] = [];
  const pitch = 5.08;
  const xOffset = ((pinCount - 1) * pitch) / 2;
  for (let i = 0; i < pinCount; i++) {
    pads.push({
      id: String(i + 1), x: -xOffset + i * pitch, y: 0,
      shape: "circle", width: 2.5, height: 2.5, drill: 1.3, layer: "through",
    });
  }
  return pads;
}

function moduleDualRowPads(pinCount: number): PadDef[] {
  const pinsPerSide = Math.ceil(pinCount / 2);
  const pitch = 2.54;
  const rowSpacing = 15.24;
  const yOffset = ((pinsPerSide - 1) * pitch) / 2;
  const pads: PadDef[] = [];
  for (let i = 0; i < pinsPerSide; i++) {
    pads.push({
      id: String(i + 1), x: -rowSpacing / 2, y: -yOffset + i * pitch,
      shape: i === 0 ? "rect" : "circle", width: 1.7, height: 1.7, drill: 1.0, layer: "through",
    });
  }
  for (let i = 0; i < pinsPerSide; i++) {
    pads.push({
      id: String(pinsPerSide + i + 1), x: rowSpacing / 2, y: yOffset - i * pitch,
      shape: "circle", width: 1.7, height: 1.7, drill: 1.0, layer: "through",
    });
  }
  return pads;
}

// ── Static pad definitions ──

const PACKAGE_PADS: Record<string, PadDef[]> = {
  "Axial_TH": [
    { id: "1", x: -3.81, y: 0, shape: "rect", width: 1.6, height: 1.6, drill: 0.8, layer: "through" },
    { id: "2", x: 3.81, y: 0, shape: "circle", width: 1.6, height: 1.6, drill: 0.8, layer: "through" },
  ],
  "Radial_TH": [
    { id: "1", x: -1.27, y: 0, shape: "rect", width: 1.6, height: 1.6, drill: 0.8, layer: "through" },
    { id: "2", x: 1.27, y: 0, shape: "circle", width: 1.6, height: 1.6, drill: 0.8, layer: "through" },
  ],
  "DO-35_TH": [
    { id: "1", x: -3.81, y: 0, shape: "rect", width: 1.6, height: 1.6, drill: 0.8, layer: "through" },
    { id: "2", x: 3.81, y: 0, shape: "circle", width: 1.6, height: 1.6, drill: 0.8, layer: "through" },
  ],
  "DO-41_TH": [
    { id: "1", x: -5.08, y: 0, shape: "rect", width: 1.8, height: 1.8, drill: 1.0, layer: "through" },
    { id: "2", x: 5.08, y: 0, shape: "circle", width: 1.8, height: 1.8, drill: 1.0, layer: "through" },
  ],
  "5mm_TH": [
    { id: "1", x: -1.27, y: 0, shape: "rect", width: 1.6, height: 1.6, drill: 0.8, layer: "through" },
    { id: "2", x: 1.27, y: 0, shape: "circle", width: 1.6, height: 1.6, drill: 0.8, layer: "through" },
  ],
  "3mm_TH": [
    { id: "1", x: -1.27, y: 0, shape: "rect", width: 1.6, height: 1.6, drill: 0.8, layer: "through" },
    { id: "2", x: 1.27, y: 0, shape: "circle", width: 1.6, height: 1.6, drill: 0.8, layer: "through" },
  ],
  "0805": [
    { id: "1", x: -0.95, y: 0, shape: "rect", width: 1.0, height: 1.3, layer: "front" },
    { id: "2", x: 0.95, y: 0, shape: "rect", width: 1.0, height: 1.3, layer: "front" },
  ],
  "0603": [
    { id: "1", x: -0.8, y: 0, shape: "rect", width: 0.8, height: 0.9, layer: "front" },
    { id: "2", x: 0.8, y: 0, shape: "rect", width: 0.8, height: 0.9, layer: "front" },
  ],
  "1206": [
    { id: "1", x: -1.4, y: 0, shape: "rect", width: 1.2, height: 1.6, layer: "front" },
    { id: "2", x: 1.4, y: 0, shape: "rect", width: 1.2, height: 1.6, layer: "front" },
  ],
  "SMB": [
    { id: "1", x: -1.9, y: 0, shape: "rect", width: 1.2, height: 1.8, layer: "front" },
    { id: "2", x: 1.9, y: 0, shape: "rect", width: 1.2, height: 1.8, layer: "front" },
  ],
  "LED_SMD_5050": [
    { id: "1", x: -1.5, y: -1.5, shape: "rect", width: 1.0, height: 1.0, layer: "front" },
    { id: "2", x: 1.5, y: -1.5, shape: "rect", width: 1.0, height: 1.0, layer: "front" },
    { id: "3", x: 1.5, y: 1.5, shape: "rect", width: 1.0, height: 1.0, layer: "front" },
    { id: "4", x: -1.5, y: 1.5, shape: "rect", width: 1.0, height: 1.0, layer: "front" },
  ],
  "USB_C_Receptacle": [
    { id: "VBUS", x: -1.75, y: -3.0, shape: "rect", width: 0.6, height: 1.2, layer: "front" },
    { id: "CC1", x: -0.25, y: -3.0, shape: "rect", width: 0.3, height: 1.0, layer: "front" },
    { id: "CC2", x: 0.25, y: -3.0, shape: "rect", width: 0.3, height: 1.0, layer: "front" },
    { id: "GND", x: 1.75, y: -3.0, shape: "rect", width: 0.6, height: 1.2, layer: "front" },
  ],
  "BarrelJack_TH": [
    { id: "1", x: -3.0, y: 0, shape: "circle", width: 2.0, height: 2.0, drill: 1.2, layer: "through" },
    { id: "2", x: 3.0, y: 0, shape: "circle", width: 2.0, height: 2.0, drill: 1.2, layer: "through" },
    { id: "3", x: 0, y: 4.7, shape: "circle", width: 2.0, height: 2.0, drill: 1.2, layer: "through" },
  ],
  "SOT-223": [
    { id: "1", x: -2.3, y: 3.15, shape: "rect", width: 1.0, height: 1.5, layer: "front" },
    { id: "2", x: 0, y: 3.15, shape: "rect", width: 1.0, height: 1.5, layer: "front" },
    { id: "3", x: 2.3, y: 3.15, shape: "rect", width: 1.0, height: 1.5, layer: "front" },
    { id: "4", x: 0, y: -3.15, shape: "rect", width: 3.0, height: 1.5, layer: "front" },
  ],
  "SOT-23": [
    { id: "1", x: -0.95, y: 1.1, shape: "rect", width: 0.6, height: 0.7, layer: "front" },
    { id: "2", x: 0.95, y: 1.1, shape: "rect", width: 0.6, height: 0.7, layer: "front" },
    { id: "3", x: 0, y: -1.1, shape: "rect", width: 0.6, height: 0.7, layer: "front" },
  ],
  "TO-220_TH": [
    { id: "1", x: -2.54, y: 0, shape: "rect", width: 1.8, height: 1.8, drill: 1.0, layer: "through" },
    { id: "2", x: 0, y: 0, shape: "circle", width: 1.8, height: 1.8, drill: 1.0, layer: "through" },
    { id: "3", x: 2.54, y: 0, shape: "circle", width: 1.8, height: 1.8, drill: 1.0, layer: "through" },
  ],
  "TO-92_TH": [
    { id: "1", x: -1.27, y: 0, shape: "rect", width: 1.4, height: 1.4, drill: 0.8, layer: "through" },
    { id: "2", x: 0, y: 0, shape: "circle", width: 1.4, height: 1.4, drill: 0.8, layer: "through" },
    { id: "3", x: 1.27, y: 0, shape: "circle", width: 1.4, height: 1.4, drill: 0.8, layer: "through" },
  ],
  "Switch_SPST_TH": [
    { id: "1", x: -2.54, y: 0, shape: "circle", width: 1.7, height: 1.7, drill: 1.0, layer: "through" },
    { id: "2", x: 2.54, y: 0, shape: "circle", width: 1.7, height: 1.7, drill: 1.0, layer: "through" },
  ],
  "Potentiometer_TH": [
    { id: "1", x: -2.54, y: 0, shape: "circle", width: 1.7, height: 1.7, drill: 1.0, layer: "through" },
    { id: "2", x: 0, y: -2.54, shape: "circle", width: 1.7, height: 1.7, drill: 1.0, layer: "through" },
    { id: "3", x: 2.54, y: 0, shape: "circle", width: 1.7, height: 1.7, drill: 1.0, layer: "through" },
  ],
  "Buzzer_12mm_TH": [
    { id: "1", x: -3.25, y: 0, shape: "rect", width: 1.6, height: 1.6, drill: 0.8, layer: "through" },
    { id: "2", x: 3.25, y: 0, shape: "circle", width: 1.6, height: 1.6, drill: 0.8, layer: "through" },
  ],
  "HC49_TH": [
    { id: "1", x: -2.44, y: 0, shape: "circle", width: 1.6, height: 1.6, drill: 0.8, layer: "through" },
    { id: "2", x: 2.44, y: 0, shape: "circle", width: 1.6, height: 1.6, drill: 0.8, layer: "through" },
  ],
  "Battery_CR2032_Holder": [
    { id: "1", x: -7.0, y: 0, shape: "circle", width: 2.0, height: 2.0, drill: 1.2, layer: "through" },
    { id: "2", x: 7.0, y: 0, shape: "circle", width: 2.0, height: 2.0, drill: 1.2, layer: "through" },
  ],
  "Battery_2xAA_Holder": [
    { id: "1", x: -14.0, y: 0, shape: "circle", width: 2.0, height: 2.0, drill: 1.2, layer: "through" },
    { id: "2", x: 14.0, y: 0, shape: "circle", width: 2.0, height: 2.0, drill: 1.2, layer: "through" },
  ],
  "DIP-8": dipPads(8),
  "DIP-16": dipPads(16),
  "DIP-28": dipPads(28),
  "PinHeader_1x2": pinHeaderPads(2),
  "PinHeader_1x3": pinHeaderPads(3),
  "PinHeader_1x4": pinHeaderPads(4),
  "PinHeader_1x6": pinHeaderPads(6),
  "PinHeader_1x8": pinHeaderPads(8),
  "PinHeader_1x10": pinHeaderPads(10),
  "PinHeader_1x15": pinHeaderPads(15),
  "PinHeader_1x20": pinHeaderPads(20),
  "JST_PH_2pin": jstPhPads(2),
  "JST_PH_3pin": jstPhPads(3),
  "JST_PH_4pin": jstPhPads(4),
  "JST_PH_5pin": jstPhPads(5),
  "ScrewTerminal_1x2": screwTerminalPads(2),
  "ScrewTerminal_1x3": screwTerminalPads(3),
};

/**
 * Get pad definitions for a package.
 */
function getPads(packageName: string, pinCount: number): PadDef[] {
  if (PACKAGE_PADS[packageName]) return PACKAGE_PADS[packageName];

  // Dynamic patterns
  const phMatch = packageName.match(/PinHeader_1x(\d+)/i);
  if (phMatch) return pinHeaderPads(parseInt(phMatch[1], 10));

  const jstMatch = packageName.match(/JST_PH_(\d+)pin/i);
  if (jstMatch) return jstPhPads(parseInt(jstMatch[1], 10));

  const stMatch = packageName.match(/ScrewTerminal_1x(\d+)/i);
  if (stMatch) return screwTerminalPads(parseInt(stMatch[1], 10));

  const dipMatch = packageName.match(/DIP-(\d+)/i);
  if (dipMatch) return dipPads(parseInt(dipMatch[1], 10));

  const modMatch = packageName.match(/Module_DIP/i);
  if (modMatch) return moduleDualRowPads(pinCount);

  return pinHeaderPads(pinCount);
}

// ── Absolute position computation ──

interface DesignComponent {
  ref: string;
  package: string;
  pins: { id: string; name: string; type: string }[];
  pcbPosition: { x: number; y: number; rotation: number };
}

interface AbsolutePadPosition {
  ref: string;
  pinId: string;
  x: number;
  y: number;
}

/**
 * Compute absolute board-level pad positions for all components.
 * Accounts for component rotation.
 */
export function computePadPositions(components: DesignComponent[]): AbsolutePadPosition[] {
  const result: AbsolutePadPosition[] = [];

  for (const comp of components) {
    const pads = getPads(comp.package, comp.pins.length);
    const cx = comp.pcbPosition.x;
    const cy = comp.pcbPosition.y;
    const rot = ((comp.pcbPosition.rotation % 360) + 360) % 360;
    const rad = (rot * Math.PI) / 180;

    for (const pad of pads) {
      // Rotate pad offset around component center
      const rx = pad.x * Math.cos(rad) - pad.y * Math.sin(rad);
      const ry = pad.x * Math.sin(rad) + pad.y * Math.cos(rad);

      result.push({
        ref: comp.ref,
        pinId: pad.id,
        x: Math.round((cx + rx) * 100) / 100,
        y: Math.round((cy + ry) * 100) / 100,
      });
    }
  }

  return result;
}

/**
 * Format pad positions as a text table for the AI prompt.
 */
export function formatPadPositionTable(positions: AbsolutePadPosition[]): string {
  const lines = ["Pad positions for routing (absolute board coordinates in mm):"];
  for (const p of positions) {
    lines.push(`  ${p.ref}.${p.pinId} -> (${p.x.toFixed(2)}, ${p.y.toFixed(2)})`);
  }
  return lines.join("\n");
}
```

**Step 2: Commit**

```bash
git add server/src/lib/padPositions.ts
git commit -m "feat: add server-side pad position computation for AI routing"
```

---

### Task 3: Route Validation (DRC)

**Files:**
- Modify: `server/src/lib/validateDesign.ts`

**Step 1: Add route-related interfaces**

Add after the existing `CircuitDesign` interface (line 53), before `ValidationIssue`:

```typescript
interface DesignTracePoint {
  x: number;
  y: number;
}

interface DesignTrace {
  netName: string;
  width: number;
  layer: string;
  points: DesignTracePoint[];
}
```

Also add `traces?: DesignTrace[]` to the `CircuitDesign` interface at line 52.

**Step 2: Add segment-to-segment distance helper**

Add before the `validateDesign` function:

```typescript
/**
 * Compute minimum distance between two line segments.
 * Each segment defined by (p1, p2) and (p3, p4).
 */
function segmentToSegmentDistance(
  x1: number, y1: number, x2: number, y2: number,
  x3: number, y3: number, x4: number, y4: number
): number {
  // Point-to-segment distance helper
  function pointToSegDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.sqrt((px - ax) ** 2 + (py - ay) ** 2);
    let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + t * dx;
    const cy = ay + t * dy;
    return Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
  }

  return Math.min(
    pointToSegDist(x1, y1, x3, y3, x4, y4),
    pointToSegDist(x2, y2, x3, y3, x4, y4),
    pointToSegDist(x3, y3, x1, y1, x2, y2),
    pointToSegDist(x4, y4, x1, y1, x2, y2),
  );
}
```

**Step 3: Add `validateRoutes()` function**

Add this exported function after `checkBoardCapacity()`:

```typescript
/**
 * Validate trace routes for DRC compliance.
 * Returns issues that can be fed back to Claude for correction.
 */
export function validateRoutes(design: unknown): ValidationIssue[] {
  if (!design || typeof design !== "object") return [];
  const d = design as Record<string, unknown>;

  const traces = d.traces as DesignTrace[] | undefined;
  if (!Array.isArray(traces) || traces.length === 0) return [];

  const issues: ValidationIssue[] = [];
  const components = (d.components || []) as DesignComponent[];
  const connections = (d.connections || []) as DesignConnection[];
  const board = d.board as DesignBoard | undefined;

  // Build net name set
  const validNets = new Set(connections.map((c) => c.netName));

  // ── Basic structure checks ──
  for (let i = 0; i < traces.length; i++) {
    const t = traces[i];
    if (!t.netName || !validNets.has(t.netName)) {
      issues.push({
        severity: "error",
        code: "ROUTE_BAD_NET",
        message: `Trace ${i} references unknown net "${t.netName}". Valid nets: ${[...validNets].join(", ")}`,
      });
    }
    if (!Array.isArray(t.points) || t.points.length < 2) {
      issues.push({
        severity: "error",
        code: "ROUTE_TOO_SHORT",
        message: `Trace ${i} (net "${t.netName}") has fewer than 2 points`,
      });
    }
    if (typeof t.width !== "number" || t.width < 0.15) {
      issues.push({
        severity: "error",
        code: "ROUTE_BAD_WIDTH",
        message: `Trace ${i} (net "${t.netName}") has width ${t.width}mm — minimum is 0.15mm (JLCPCB limit)`,
      });
    }

    // Check points are valid numbers
    if (Array.isArray(t.points)) {
      for (let j = 0; j < t.points.length; j++) {
        const p = t.points[j];
        if (typeof p.x !== "number" || typeof p.y !== "number" || !isFinite(p.x) || !isFinite(p.y)) {
          issues.push({
            severity: "error",
            code: "ROUTE_BAD_POINT",
            message: `Trace ${i} (net "${t.netName}") point ${j} has invalid coordinates (${p.x}, ${p.y})`,
          });
        }
      }
    }
  }

  // ── Board bounds check ──
  if (board && board.width > 0 && board.height > 0) {
    for (let i = 0; i < traces.length; i++) {
      const t = traces[i];
      if (!Array.isArray(t.points)) continue;
      for (let j = 0; j < t.points.length; j++) {
        const p = t.points[j];
        if (p.x < 0 || p.x > board.width || p.y < 0 || p.y > board.height) {
          issues.push({
            severity: "error",
            code: "ROUTE_OUT_OF_BOUNDS",
            message: `Trace (net "${t.netName}") point ${j} at (${p.x.toFixed(2)}, ${p.y.toFixed(2)}) is outside board bounds (${board.width}x${board.height}mm)`,
          });
        }
      }
    }
  }

  // ── Trace-to-trace clearance ──
  const MIN_CLEARANCE = 0.2; // mm
  // Build flat segment list
  interface Segment { netName: string; x1: number; y1: number; x2: number; y2: number; traceIdx: number; segIdx: number; }
  const segments: Segment[] = [];
  for (let i = 0; i < traces.length; i++) {
    const t = traces[i];
    if (!Array.isArray(t.points)) continue;
    for (let j = 0; j < t.points.length - 1; j++) {
      segments.push({
        netName: t.netName,
        x1: t.points[j].x, y1: t.points[j].y,
        x2: t.points[j + 1].x, y2: t.points[j + 1].y,
        traceIdx: i, segIdx: j,
      });
    }
  }

  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      const a = segments[i];
      const b = segments[j];
      if (a.netName === b.netName) continue; // same net, no clearance needed
      const dist = segmentToSegmentDistance(a.x1, a.y1, a.x2, a.y2, b.x1, b.y1, b.x2, b.y2);
      if (dist < MIN_CLEARANCE) {
        const midX = ((a.x1 + a.x2) / 2 + (b.x1 + b.x2) / 2) / 2;
        const midY = ((a.y1 + a.y2) / 2 + (b.y1 + b.y2) / 2) / 2;
        issues.push({
          severity: "error",
          code: "ROUTE_CLEARANCE",
          message: `Trace "${a.netName}" seg ${a.segIdx}-${a.segIdx + 1} is ${dist.toFixed(2)}mm from trace "${b.netName}" seg ${b.segIdx}-${b.segIdx + 1} near (${midX.toFixed(1)}, ${midY.toFixed(1)}). Min clearance: ${MIN_CLEARANCE}mm.`,
        });
      }
    }
  }

  // ── Connectivity check — every connection must have traces spanning its pads ──
  const routedNets = new Set(traces.filter((t) => Array.isArray(t.points) && t.points.length >= 2).map((t) => t.netName));
  for (const conn of connections) {
    if (conn.pins.length < 2) continue;
    if (!routedNets.has(conn.netName)) {
      issues.push({
        severity: "warning",
        code: "ROUTE_UNCONNECTED",
        message: `Net "${conn.netName}" has ${conn.pins.length} pins but no traces. Pads: ${conn.pins.map((p) => `${p.ref}.${p.pin}`).join(", ")}`,
      });
    }
  }

  return issues;
}
```

**Step 4: Export the new function**

The function is already exported via the `export` keyword. Make sure the import in `chat.ts` is updated (Task 5).

**Step 5: Commit**

```bash
git add server/src/lib/validateDesign.ts
git commit -m "feat: add validateRoutes DRC for trace geometry and clearance"
```

---

### Task 4: AI Prompt Engineering

**Files:**
- Modify: `server/src/lib/buildPrompt.ts`

**Step 1: Update the buildSystemPrompt function signature**

Change the function to accept an optional pad position table string:

```typescript
export function buildSystemPrompt(padPositionTable?: string): string {
```

**Step 2: Add routing rules section**

Add after the Physical/PCB Rules section (after line 109, before Schematic Rules):

```typescript
**Trace Routing Rules:**
- You MUST generate a "traces" array in the design JSON with copper traces connecting all pads.
- Each trace is a polyline: an array of {x, y} waypoints in mm (absolute board coordinates).
- The first point MUST be at the source pad center. The last point MUST be at the destination pad center.
- Each trace connects exactly TWO pads on the same net. A net with N pads needs N-1 traces (spanning tree).
- Use 45-degree or 90-degree bends only. Route traces with L-shaped or Z-shaped paths to avoid obstacles.
- All traces must stay within the board outline (0,0 to board.width, board.height).
- Minimum clearance between traces on different nets: 0.2mm (including trace width).
- Route power traces (VBUS, VCC, GND) with width 0.5mm. Route signal traces with width 0.25mm.
- All traces are on the "front" copper layer (single-layer routing).
- Keep traces simple — prefer short, direct paths with 1-2 bends maximum.
- Do NOT route traces through component footprints (avoid the area occupied by other components).
${padPositionTable ? `\n${padPositionTable}\n` : ""}
```

**Step 3: Add traces to the output format JSON schema**

Add the traces field to the TypeScript interface in the OUTPUT FORMAT section (after `branding?`, around line 192):

```typescript
  traces?: {
    netName: string;       // Must match a connection's netName
    width: number;         // mm — 0.25 signal, 0.5 power
    layer: "front";        // Front copper only
    points: { x: number; y: number }[];  // Polyline waypoints, first/last at pad centers
  }[];
```

**Step 4: Add routing example**

Add after the output format section (before the closing backtick of the template literal):

```typescript
**TRACE ROUTING EXAMPLE:**

For a board with a JST connector (J1) at (3, 6) and a WS2812B LED (LED1) at (20, 6):
- Net "VCC" connects J1.VCC pad at (2.0, 6.0) to LED1.VDD pad at (18.5, 4.5)
- Net "GND" connects J1.GND pad at (4.0, 6.0) to LED1.VSS pad at (21.5, 7.5)

The traces array would be:
"traces": [
  { "netName": "VCC", "width": 0.5, "layer": "front", "points": [{"x": 2.0, "y": 6.0}, {"x": 2.0, "y": 4.5}, {"x": 18.5, "y": 4.5}] },
  { "netName": "GND", "width": 0.5, "layer": "front", "points": [{"x": 4.0, "y": 6.0}, {"x": 4.0, "y": 7.5}, {"x": 21.5, "y": 7.5}] }
]

Each trace starts at one pad and ends at another, with intermediate waypoints for bends.
```

**Step 5: Commit**

```bash
git add server/src/lib/buildPrompt.ts
git commit -m "feat: add trace routing instructions to AI system prompt"
```

---

### Task 5: Chat Endpoint Integration

**Files:**
- Modify: `server/src/routes/chat.ts`

**Step 1: Add imports**

Add to the existing imports at the top:

```typescript
import { computePadPositions, formatPadPositionTable } from "../lib/padPositions.js";
import { validateRoutes } from "../lib/validateDesign.js";
```

Note: `validateRoutes` needs to be added to the existing import from `validateDesign.js` — merge it with the existing destructured import on line 7:

```typescript
import { validateDesign, formatValidationFeedback, generateSpatialMap, checkBoardCapacity, validateRoutes } from "../lib/validateDesign.js";
```

**Step 2: Update buildSystemPrompt call to include pad positions**

After the initial design is extracted and validated (around line 190), but we also need pad positions for the first call. The challenge is: on the first call, we don't know the design yet. The pad positions are needed for routing, but routing happens in the same response.

Solution: For the first call, don't include pad positions (Claude generates placement + routing together without explicit pad table). For retry calls, compute pad positions from the extracted design and include them.

Actually, looking more carefully at the design, the prompt should instruct Claude to compute positions from the component data it already has. The pad position table is most useful during retries when Claude needs to fix routes.

Change line 182 to build the system prompt without pad positions for the initial call:

```typescript
const systemPrompt = buildSystemPrompt();
```

This stays the same. The pad position table will be injected during retries.

**Step 3: Add route validation to the validation flow**

After the existing `validateDesign(design)` call (line 191), add route validation:

```typescript
if (design) {
  const validation = validateDesign(design);

  // Also validate routes if present
  const routeIssues = validateRoutes(design);
  if (routeIssues.length > 0) {
    validation.errors.push(...routeIssues.filter((i) => i.severity === "error"));
    validation.warnings.push(...routeIssues.filter((i) => i.severity === "warning"));
    if (routeIssues.some((i) => i.severity === "error")) {
      validation.valid = false;
    }
  }
```

Wait — `validateDesign` returns a `ValidationResult` which is `{ valid, errors, warnings }`. We need to merge route issues into it. But the returned object's arrays are not readonly, so we can push to them.

Actually, the cleanest approach: call `validateRoutes` inside `validateDesign` at the end, before `return toResult(issues)`. That way all validation is in one place.

**Revised approach for Task 3**: Add the `validateRoutes` call inside `validateDesign()` instead of in chat.ts. At the bottom of `validateDesign()`, before `return toResult(issues)` (line 502):

```typescript
  // ─── ROUTE VALIDATION ─────────────────────────────────────
  if (Array.isArray((d as Record<string, unknown>).traces)) {
    const routeIssues = validateRoutes(design);
    issues.push(...routeIssues);
  }

  return toResult(issues);
```

This means `validateRoutes` doesn't need to be exported or imported in chat.ts. Keep it as a non-exported helper called from `validateDesign`.

**Step 4: Include pad positions in retry prompts**

In the retry loop (around line 234), after computing spatial context, add pad position context:

```typescript
// Compute pad positions for routing feedback
let padContext = "";
if (design) {
  const designObj = design as { components: { ref: string; package: string; pins: { id: string; name: string; type: string }[]; pcbPosition: { x: number; y: number; rotation: number } }[] };
  if (designObj.components) {
    const padPositions = computePadPositions(designObj.components);
    padContext = "\n\n" + formatPadPositionTable(padPositions);
  }
}
```

And include `padContext` in the correction message (line 249):

```typescript
content: `[SYSTEM — internal validation, not from the user...]\n\n${currentFeedback}${spatialContext}${padContext}`,
```

**Also**: For the initial call, build the system prompt with pad positions if available. But since we don't have a design before the first call, just use `buildSystemPrompt()` as-is. Claude will route based on the component positions it generates.

**Step 5: Commit**

```bash
git add server/src/routes/chat.ts
git commit -m "feat: integrate route validation and pad positions into chat flow"
```

---

### Task 6: PCB Editor — Trace and Rat's Nest Visualization

**Files:**
- Modify: `src/components/PcbLayoutEditor.tsx`

**Step 1: Add imports for pad lookup**

Add to the imports at the top of the file:

```typescript
import { getPads } from "../lib/padLibrary";
```

**Step 2: Define net color palette**

Add after the `TYPE_COLORS` constant (line 31):

```typescript
const NET_COLORS = [
  "#ef4444", // red
  "#3b82f6", // blue
  "#22c55e", // green
  "#f97316", // orange
  "#a855f7", // purple
  "#06b6d4", // cyan
  "#ec4899", // pink
  "#eab308", // yellow
];

function getNetColor(netName: string, index: number): string {
  return NET_COLORS[index % NET_COLORS.length];
}
```

**Step 3: Compute absolute pad positions for rat's nest**

Inside the component function, after the `overlapping` computation (line 254), add:

```typescript
// ── Compute absolute pad positions for rat's nest ──
const padPositions = useMemo(() => {
  const positions = new Map<string, { x: number; y: number }>();
  for (const comp of components) {
    const pos = getEffectivePosition(comp);
    const pads = getPads(comp.package, comp.pins.length);
    const rot = ((pos.rotation % 360) + 360) % 360;
    const rad = (rot * Math.PI) / 180;
    for (const pad of pads) {
      const rx = pad.x * Math.cos(rad) - pad.y * Math.sin(rad);
      const ry = pad.x * Math.sin(rad) + pad.y * Math.cos(rad);
      positions.set(`${comp.ref}.${pad.id}`, {
        x: pos.x + rx,
        y: pos.y + ry,
      });
    }
  }
  return positions;
}, [components, getEffectivePosition]);
```

Add `useMemo` to the React import on line 1.

**Step 4: Compute rat's nest lines**

After the padPositions computation:

```typescript
// ── Rat's nest: unrouted connections ──
const ratNestLines = useMemo(() => {
  const lines: { x1: number; y1: number; x2: number; y2: number; netName: string }[] = [];
  const routedNets = new Set((design.traces || []).map((t) => t.netName));

  for (const conn of design.connections) {
    if (routedNets.has(conn.netName)) continue; // already routed
    // Draw rat's nest between consecutive pins
    for (let i = 0; i < conn.pins.length - 1; i++) {
      const p1 = padPositions.get(`${conn.pins[i].ref}.${conn.pins[i].pin}`);
      const p2 = padPositions.get(`${conn.pins[i + 1].ref}.${conn.pins[i + 1].pin}`);
      if (p1 && p2) {
        lines.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, netName: conn.netName });
      }
    }
  }
  return lines;
}, [design.connections, design.traces, padPositions]);
```

**Step 5: Add trace and rat's nest SVG elements**

In the SVG render, between the board outline (line 283) and the components (line 285), add:

```tsx
{/* Routed traces */}
{(design.traces || []).map((trace, i) => {
  const netIdx = design.connections.findIndex((c) => c.netName === trace.netName);
  const color = getNetColor(trace.netName, netIdx >= 0 ? netIdx : i);
  const pointsStr = trace.points.map((p) => `${p.x},${p.y}`).join(" ");
  return (
    <g key={`trace-${i}`}>
      <polyline
        points={pointsStr}
        fill="none"
        stroke={color}
        strokeWidth={trace.width}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ pointerEvents: "none" }}
      />
      {/* Pad endpoints */}
      <circle cx={trace.points[0].x} cy={trace.points[0].y} r={trace.width * 0.8} fill={color} style={{ pointerEvents: "none" }} />
      <circle cx={trace.points[trace.points.length - 1].x} cy={trace.points[trace.points.length - 1].y} r={trace.width * 0.8} fill={color} style={{ pointerEvents: "none" }} />
    </g>
  );
})}

{/* Rat's nest (unrouted connections) */}
{ratNestLines.map((line, i) => (
  <line
    key={`ratnest-${i}`}
    x1={line.x1} y1={line.y1}
    x2={line.x2} y2={line.y2}
    stroke="#9ca3af"
    strokeWidth={0.15}
    strokeDasharray="1 1"
    style={{ pointerEvents: "none" }}
  />
))}
```

**Step 6: Commit**

```bash
git add src/components/PcbLayoutEditor.tsx
git commit -m "feat: render copper traces and rat's nest lines in PCB editor"
```

---

### Task 7: KiCad Export — Trace Segments

**Files:**
- Modify: `src/lib/exportKicad.ts`

**Step 1: Add renderTraces function**

Add after the `renderBranding` function (after line 245):

```typescript
/** Generate KiCad segment entries from trace polylines */
function renderTraces(
  design: CircuitDesign,
  netNames: string[],
): string {
  if (!design.traces || design.traces.length === 0) return "";

  // Build netName -> ordinal map
  const netToOrdinal = new Map<string, number>();
  for (let i = 0; i < netNames.length; i++) {
    netToOrdinal.set(netNames[i], i);
  }

  const segments: string[] = [];
  for (const trace of design.traces) {
    const netOrd = netToOrdinal.get(trace.netName) ?? 0;
    const layer = trace.layer === "front" ? "F.Cu" : "B.Cu";

    for (let i = 0; i < trace.points.length - 1; i++) {
      const p1 = trace.points[i];
      const p2 = trace.points[i + 1];
      segments.push(`  (segment (start ${n(p1.x)} ${n(p1.y)}) (end ${n(p2.x)} ${n(p2.y)}) (width ${n(trace.width)}) (layer "${layer}") (net ${netOrd}) (uuid "${uuid()}"))`);
    }
  }

  return segments.join("\n");
}
```

**Step 2: Include trace segments in output**

In the `generateKicadPcb` function, add the trace rendering. After the `branding` line (line 264) and before the `footprints` line (line 295), add:

```typescript
const traceSegments = renderTraces(design, netNames);
```

And include it in the output template. Add `${traceSegments}` after `${footprints}` in the return string:

```typescript
return `(kicad_pcb
  ...
${footprints}

${traceSegments}
)
`;
```

**Step 3: Commit**

```bash
git add src/lib/exportKicad.ts
git commit -m "feat: export trace segments to KiCad .kicad_pcb file"
```

---

### Task 8: End-to-End Verification

**Step 1: Build check**

Run: `npm run build`
Expected: No TypeScript errors

**Step 2: Server build check**

Run: `cd server && npm run build`
Expected: No TypeScript errors

**Step 3: Manual test**

1. Start the dev server: `npm run dev`
2. Open the app in browser
3. Enter: "Design me a small PCB with a JST connector and a WS2812B LED"
4. Verify:
   - Design generates with `traces` array in the JSON
   - PCB tab shows colored polylines for routed traces
   - If any nets are unrouted, dashed gray rat's nest lines appear
   - Click "Download KiCad" and verify the file contains `(segment ...)` entries
   - Open the downloaded file in KiCad 8 and verify traces appear

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: address issues found during end-to-end testing"
```
