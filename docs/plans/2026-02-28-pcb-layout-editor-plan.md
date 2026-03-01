# PCB-First Layout Editor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the placeholder PCB tab with an interactive SVG-based layout editor where users drag components to arrange their board, and add a server-side overlap resolver so the AI's initial placement is clean.

**Architecture:** The PCB editor is a new React component (`PcbLayoutEditor`) rendering an SVG with draggable rectangles. The server gets a new `resolveOverlaps()` function that fixes collisions algorithmically after AI generation. The client gets a copy of the footprint dimension tables so it can render components at correct sizes without server round-trips.

**Tech Stack:** React + SVG (no new dependencies), TypeScript, existing footprint dimension data.

---

### Task 1: Client-Side Footprint Lookup

Create a client-side module that resolves footprint dimensions for rendering components at correct sizes.

**Files:**
- Create: `src/lib/footprintLookup.ts`

**Context:** The server has `server/src/lib/footprintTable.ts` with `PACKAGE_FOOTPRINTS`, `TYPE_DEFAULTS`, `GENERIC_FALLBACK`, dynamic PinHeader/JST sizing, and a library-first resolution step that searches `COMPONENT_LIBRARY` by value. The client needs the same logic but can't import the server's 408-entry component library. Instead, we'll build a minimal `VALUE_FOOTPRINTS` map (just `{ [lowercaseValue]: FootprintDimensions }`) extracted from the library data.

**Step 1: Create the footprint lookup module**

Create `src/lib/footprintLookup.ts` with:

```typescript
/**
 * Client-side footprint dimension lookup for PCB layout rendering.
 *
 * Mirrors the server's footprintTable.ts resolution logic.
 * Uses a pre-extracted value→footprint map instead of the full component library.
 */

export interface FootprintDimensions {
  width: number;
  height: number;
  keepout: number;
}

/**
 * Value-to-footprint map for components that share ambiguous package names.
 * Extracted from the server's COMPONENT_LIBRARY — only includes components
 * whose footprint differs from their package table entry.
 *
 * Key: lowercase component value or name
 * Value: physical footprint dimensions
 */
const VALUE_FOOTPRINTS: Record<string, FootprintDimensions> = {
  // Displays — all use Module_4pin but have very different sizes
  "lcd 1602 i2c":            { width: 80.0, height: 36.0, keepout: 1.5 },
  "lcd 1602 display with i2c backpack": { width: 80.0, height: 36.0, keepout: 1.5 },
  "ssd1306 oled":            { width: 27.0, height: 27.0, keepout: 1.5 },
  "oled ssd1306 display":    { width: 27.0, height: 27.0, keepout: 1.5 },
  // Sensors
  "dht22":                   { width: 15.0, height: 20.0, keepout: 1.5 },
  "dht22 temperature and humidity sensor": { width: 15.0, height: 20.0, keepout: 1.5 },
  "dht11":                   { width: 12.0, height: 16.0, keepout: 1.5 },
  "dht11 temperature and humidity sensor": { width: 12.0, height: 16.0, keepout: 1.5 },
  "hc-sr04":                 { width: 45.0, height: 20.0, keepout: 1.5 },
  "hc-sr04 ultrasonic sensor": { width: 45.0, height: 20.0, keepout: 1.5 },
  "bme280":                  { width: 13.0, height: 10.0, keepout: 1.0 },
  "bme280 environmental sensor": { width: 13.0, height: 10.0, keepout: 1.0 },
  // Comms modules
  "esp-01":                  { width: 25.0, height: 14.0, keepout: 1.0 },
  "esp-01 wifi module":      { width: 25.0, height: 14.0, keepout: 1.0 },
  "hc-05":                   { width: 27.0, height: 13.0, keepout: 1.0 },
  "hc-05 bluetooth module":  { width: 27.0, height: 13.0, keepout: 1.0 },
  "nrf24l01":                { width: 29.0, height: 15.0, keepout: 1.0 },
  "nrf24l01 wireless module": { width: 29.0, height: 15.0, keepout: 1.0 },
  // Power modules
  "mt3608":                  { width: 36.0, height: 17.0, keepout: 1.5 },
  "mt3608 boost converter":  { width: 36.0, height: 17.0, keepout: 1.5 },
  // Motor drivers
  "l298n":                   { width: 43.0, height: 43.0, keepout: 2.0 },
  "l298n dual h-bridge motor driver": { width: 43.0, height: 43.0, keepout: 2.0 },
  "drv8833":                 { width: 18.0, height: 15.0, keepout: 1.0 },
  "drv8833 dual motor driver": { width: 18.0, height: 15.0, keepout: 1.0 },
  // Audio
  "max9814":                 { width: 23.0, height: 16.0, keepout: 1.0 },
  "max9814 electret microphone amplifier": { width: 23.0, height: 16.0, keepout: 1.0 },
  // MCUs
  "arduino nano":            { width: 43.0, height: 18.0, keepout: 1.5 },
  "esp32 devkit":            { width: 52.0, height: 28.0, keepout: 1.5 },
  "esp32 devkitc":           { width: 52.0, height: 28.0, keepout: 1.5 },
  "raspberry pi pico":       { width: 51.0, height: 21.0, keepout: 1.5 },
  "arduino uno":             { width: 69.0, height: 53.0, keepout: 2.0 },
  "arduino mega":            { width: 102.0, height: 53.0, keepout: 2.0 },
  "teensy 4.0":              { width: 36.0, height: 18.0, keepout: 1.5 },
  "adafruit feather":        { width: 51.0, height: 23.0, keepout: 1.5 },
  "seeeduino xiao":          { width: 21.0, height: 18.0, keepout: 1.0 },
  "wemos d1 mini":           { width: 35.0, height: 26.0, keepout: 1.5 },
  "stm32 blue pill":         { width: 53.0, height: 23.0, keepout: 1.5 },
};

// --- Copied from server/src/lib/footprintTable.ts (keep in sync) ---

const PACKAGE_FOOTPRINTS: Record<string, FootprintDimensions> = {
  "Axial_TH":                { width: 9.0, height: 3.0, keepout: 1.5 },
  "Radial_TH":               { width: 5.0, height: 5.0, keepout: 1.0 },
  "DO-35_TH":                { width: 7.0, height: 2.5, keepout: 1.5 },
  "DO-41_TH":                { width: 9.0, height: 3.0, keepout: 1.5 },
  "0805":                    { width: 2.0, height: 1.25, keepout: 0.5 },
  "0603":                    { width: 1.6, height: 0.8, keepout: 0.5 },
  "1206":                    { width: 3.2, height: 1.6, keepout: 0.5 },
  "SMB":                     { width: 4.5, height: 3.5, keepout: 0.5 },
  "5mm_TH":                  { width: 5.0, height: 5.0, keepout: 1.0 },
  "3mm_TH":                  { width: 3.0, height: 3.0, keepout: 1.0 },
  "LED_SMD_5050":            { width: 5.0, height: 5.0, keepout: 0.5 },
  "USB_C_Receptacle":        { width: 9.0, height: 7.5, keepout: 1.0 },
  "BarrelJack_TH":           { width: 14.0, height: 9.0, keepout: 1.0 },
  "ScrewTerminal_1x2_P5.08mm": { width: 10.16, height: 7.5, keepout: 1.0 },
  "SOT-223":                 { width: 6.5, height: 3.5, keepout: 0.5 },
  "SOT-23":                  { width: 3.0, height: 1.4, keepout: 0.5 },
  "TO-220_TH":               { width: 10.0, height: 4.5, keepout: 1.5 },
  "TO-92_TH":                { width: 4.5, height: 3.5, keepout: 1.0 },
  "DIP-8":                   { width: 10.0, height: 7.0, keepout: 1.0 },
  "DIP-16":                  { width: 20.0, height: 7.5, keepout: 1.0 },
  "DIP-28":                  { width: 36.0, height: 7.5, keepout: 1.5 },
  "SW_Push_6mm_TH":          { width: 6.0, height: 6.0, keepout: 1.0 },
  "SW_Slide_SPDT_TH":        { width: 8.5, height: 3.5, keepout: 1.0 },
  "HC49_TH":                 { width: 11.0, height: 5.0, keepout: 1.0 },
  "Potentiometer_TH":        { width: 10.0, height: 10.0, keepout: 1.5 },
  "Buzzer_12mm_TH":          { width: 12.0, height: 12.0, keepout: 1.0 },
  "SIP-4_TH":                { width: 15.0, height: 20.0, keepout: 1.5 },
  "LDR_TH":                  { width: 5.0, height: 5.0, keepout: 1.0 },
  "Module_DIP":              { width: 52.0, height: 28.0, keepout: 1.5 },
  "Module_DIP_40pin":        { width: 51.0, height: 21.0, keepout: 1.5 },
  "Module_DIP_30pin":        { width: 43.0, height: 18.0, keepout: 1.5 },
  "Module_4pin":             { width: 13.0, height: 10.0, keepout: 1.0 },
  "Module_3pin":             { width: 32.0, height: 24.0, keepout: 1.5 },
  "Module_6pin":             { width: 27.0, height: 13.0, keepout: 1.0 },
  "Module_8pin":             { width: 20.0, height: 16.0, keepout: 1.0 },
  "Module_10pin":            { width: 18.0, height: 15.0, keepout: 1.0 },
  "Module_16pin":            { width: 23.0, height: 16.0, keepout: 1.0 },
  "BatteryHolder_2xAA":      { width: 58.0, height: 31.0, keepout: 2.0 },
  "BatteryHolder_18650":     { width: 77.0, height: 21.0, keepout: 2.0 },
};

const TYPE_DEFAULTS: Record<string, FootprintDimensions> = {
  resistor:   { width: 9.0, height: 3.0, keepout: 1.5 },
  capacitor:  { width: 5.0, height: 5.0, keepout: 1.0 },
  led:        { width: 5.0, height: 5.0, keepout: 1.0 },
  diode:      { width: 7.0, height: 2.5, keepout: 1.5 },
  connector:  { width: 10.0, height: 6.0, keepout: 1.0 },
  ic:         { width: 20.0, height: 10.0, keepout: 1.0 },
  mosfet:     { width: 10.0, height: 4.5, keepout: 1.5 },
  switch:     { width: 6.0, height: 6.0, keepout: 1.0 },
  regulator:  { width: 6.5, height: 3.5, keepout: 0.5 },
};

const GENERIC_FALLBACK: FootprintDimensions = { width: 10.0, height: 10.0, keepout: 1.0 };

/**
 * Look up footprint dimensions for a component.
 *
 * Resolution order (mirrors server):
 * 1. Value match in VALUE_FOOTPRINTS map
 * 2. Exact package name match
 * 3. Dynamic PinHeader/JST sizing
 * 4. Prefix match in known packages
 * 5. Component type default
 * 6. Generic fallback (10x10mm)
 */
export function getFootprint(pkg: string, type?: string, value?: string): FootprintDimensions {
  // 1. Value match — resolves ambiguous packages like Module_4pin
  if (value) {
    const valueLower = value.toLowerCase();
    if (VALUE_FOOTPRINTS[valueLower]) {
      return VALUE_FOOTPRINTS[valueLower];
    }
    // Fuzzy: check if any key is contained in the value or vice versa
    for (const [key, dims] of Object.entries(VALUE_FOOTPRINTS)) {
      if (valueLower.includes(key) || key.includes(valueLower)) {
        return dims;
      }
    }
  }

  // 2. Exact package match
  if (PACKAGE_FOOTPRINTS[pkg]) {
    return PACKAGE_FOOTPRINTS[pkg];
  }

  // 3. Dynamic sizing
  if (pkg.startsWith("PinHeader_1x")) {
    const pinMatch = pkg.match(/PinHeader_1x(\d+)/);
    const pinCount = pinMatch ? parseInt(pinMatch[1], 10) : 2;
    return { width: pinCount * 2.54, height: 2.54, keepout: 1.0 };
  }
  if (pkg.startsWith("JST_PH_")) {
    const pinMatch = pkg.match(/1x(\d+)/);
    const pinCount = pinMatch ? parseInt(pinMatch[1], 10) : 3;
    return { width: pinCount * 2.0 + 2.0, height: 6.0, keepout: 1.0 };
  }

  // 4. Prefix match
  for (const [key, dims] of Object.entries(PACKAGE_FOOTPRINTS)) {
    if (pkg.startsWith(key)) {
      return dims;
    }
  }

  // 5. Type-based default
  if (type && TYPE_DEFAULTS[type]) {
    return TYPE_DEFAULTS[type];
  }

  // 6. Generic fallback
  return GENERIC_FALLBACK;
}

/**
 * Compute the axis-aligned bounding rectangle of a component on the PCB.
 */
export function getComponentBounds(
  x: number,
  y: number,
  rotation: number,
  footprint: FootprintDimensions
): { left: number; top: number; right: number; bottom: number } {
  const totalW = footprint.width + 2 * footprint.keepout;
  const totalH = footprint.height + 2 * footprint.keepout;
  const rot = ((rotation % 360) + 360) % 360;
  const swapped = rot === 90 || rot === 270;
  const w = swapped ? totalH : totalW;
  const h = swapped ? totalW : totalH;
  return {
    left: x - w / 2,
    top: y - h / 2,
    right: x + w / 2,
    bottom: y + h / 2,
  };
}

/**
 * Check if two axis-aligned rectangles overlap.
 */
export function rectanglesOverlap(
  a: { left: number; top: number; right: number; bottom: number },
  b: { left: number; top: number; right: number; bottom: number }
): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}
```

Note: The VALUE_FOOTPRINTS map must be populated by checking every component in `server/src/lib/componentLibrary.ts` that has a `Module_*` package or any other package where the library footprint differs from the package table entry. The implementer should run a quick script to verify all entries are correct.

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: PASS (no type errors)

**Step 3: Commit**

```bash
git add src/lib/footprintLookup.ts
git commit -m "feat: add client-side footprint dimension lookup"
```

---

### Task 2: Server-Side Overlap Resolver

Create a function that algorithmically fixes overlapping component positions.

**Files:**
- Create: `server/src/lib/resolveOverlaps.ts`

**Context:** When the AI generates a design, components may overlap. The validator (`server/src/lib/validateDesign.ts`) catches these as `FOOTPRINT_OVERLAP` errors. Instead of asking the AI to fix spatial math (which it can't do reliably), we fix positions server-side with a greedy algorithm.

**Step 1: Create the overlap resolver**

Create `server/src/lib/resolveOverlaps.ts`:

```typescript
/**
 * Server-side overlap resolver.
 *
 * After AI generates component positions, this function fixes any overlaps
 * by shifting components to the nearest non-overlapping position.
 *
 * Algorithm: greedy largest-first placement.
 * 1. Sort components by footprint area (largest first)
 * 2. "Place" each component in order — if it overlaps an already-placed
 *    component, shift it to the nearest clear position
 * 3. If a component lands outside the board, grow the board to fit
 */

import { getFootprint, getComponentBounds, rectanglesOverlap } from "./footprintTable.js";
import type { FootprintDimensions } from "./footprintTable.js";

interface ComponentPosition {
  ref: string;
  type: string;
  package: string;
  value?: string;
  pcbPosition: { x: number; y: number; rotation: number };
}

interface DesignToResolve {
  components: ComponentPosition[];
  board: { width: number; height: number };
}

const MIN_GAP = 0.5; // mm — minimum gap between component footprints

/**
 * Resolve overlapping component positions in-place.
 * Returns true if any positions were changed.
 */
export function resolveOverlaps(design: DesignToResolve): boolean {
  const components = design.components.filter(
    c => c.pcbPosition && typeof c.pcbPosition.x === "number" && typeof c.pcbPosition.y === "number"
  );

  if (components.length < 2) return false;

  // Build footprint + bounds for each component
  const items = components.map(c => {
    const fp = getFootprint(c.package, c.type, c.value);
    return { comp: c, fp };
  });

  // Sort by footprint area descending (place largest first)
  items.sort((a, b) => {
    const areaA = (a.fp.width + 2 * a.fp.keepout) * (a.fp.height + 2 * a.fp.keepout);
    const areaB = (b.fp.width + 2 * b.fp.keepout) * (b.fp.height + 2 * b.fp.keepout);
    return areaB - areaA;
  });

  let changed = false;
  const placed: { comp: ComponentPosition; fp: FootprintDimensions }[] = [];

  for (const item of items) {
    const { comp, fp } = item;
    const bounds = getComponentBounds(comp.pcbPosition.x, comp.pcbPosition.y, comp.pcbPosition.rotation, fp);

    // Check overlap with all already-placed components
    let hasOverlap = false;
    for (const p of placed) {
      const pBounds = getComponentBounds(p.comp.pcbPosition.x, p.comp.pcbPosition.y, p.comp.pcbPosition.rotation, p.fp);
      if (rectanglesOverlap(bounds, pBounds)) {
        hasOverlap = true;
        break;
      }
    }

    if (hasOverlap) {
      // Find nearest non-overlapping position via spiral search
      const newPos = findClearPosition(comp, fp, placed, design.board);
      if (newPos) {
        comp.pcbPosition.x = newPos.x;
        comp.pcbPosition.y = newPos.y;
        changed = true;
      }
    }

    placed.push(item);
  }

  // Grow board if any component extends past edges
  const margin = 2.0; // mm margin on each side
  for (const item of placed) {
    const b = getComponentBounds(item.comp.pcbPosition.x, item.comp.pcbPosition.y, item.comp.pcbPosition.rotation, item.fp);
    if (b.right + margin > design.board.width) {
      design.board.width = Math.ceil(b.right + margin);
      changed = true;
    }
    if (b.bottom + margin > design.board.height) {
      design.board.height = Math.ceil(b.bottom + margin);
      changed = true;
    }
    if (b.left < margin) {
      // Shift this component right so it fits
      const shift = margin - b.left;
      item.comp.pcbPosition.x += shift;
      changed = true;
    }
    if (b.top < margin) {
      const shift = margin - b.top;
      item.comp.pcbPosition.y += shift;
      changed = true;
    }
  }

  return changed;
}

/**
 * Spiral search outward from the component's current position
 * to find the nearest non-overlapping spot.
 */
function findClearPosition(
  comp: ComponentPosition,
  fp: FootprintDimensions,
  placed: { comp: ComponentPosition; fp: FootprintDimensions }[],
  board: { width: number; height: number }
): { x: number; y: number } | null {
  const step = 2.0; // mm step size for search
  const maxRadius = Math.max(board.width, board.height) * 2;
  const origX = comp.pcbPosition.x;
  const origY = comp.pcbPosition.y;

  // Spiral search: try positions at increasing distance
  for (let radius = step; radius <= maxRadius; radius += step) {
    // Try positions around the perimeter at this radius
    const circumference = 2 * Math.PI * radius;
    const numPoints = Math.max(8, Math.ceil(circumference / step));

    for (let i = 0; i < numPoints; i++) {
      const angle = (2 * Math.PI * i) / numPoints;
      const testX = origX + radius * Math.cos(angle);
      const testY = origY + radius * Math.sin(angle);

      // Skip negative positions
      if (testX < 0 || testY < 0) continue;

      const testBounds = getComponentBounds(testX, testY, comp.pcbPosition.rotation, fp);

      let clear = true;
      for (const p of placed) {
        const pBounds = getComponentBounds(p.comp.pcbPosition.x, p.comp.pcbPosition.y, p.comp.pcbPosition.rotation, p.fp);
        // Check with MIN_GAP padding
        const padded = {
          left: pBounds.left - MIN_GAP,
          top: pBounds.top - MIN_GAP,
          right: pBounds.right + MIN_GAP,
          bottom: pBounds.bottom + MIN_GAP,
        };
        if (rectanglesOverlap(testBounds, padded)) {
          clear = false;
          break;
        }
      }

      if (clear) {
        return { x: Math.round(testX * 10) / 10, y: Math.round(testY * 10) / 10 };
      }
    }
  }

  // Fallback: place far to the right of all existing components
  let maxRight = 0;
  for (const p of placed) {
    const b = getComponentBounds(p.comp.pcbPosition.x, p.comp.pcbPosition.y, p.comp.pcbPosition.rotation, p.fp);
    if (b.right > maxRight) maxRight = b.right;
  }
  const totalW = fp.width + 2 * fp.keepout;
  return { x: Math.round((maxRight + MIN_GAP + totalW / 2) * 10) / 10, y: origY };
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc -p server/tsconfig.json --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add server/src/lib/resolveOverlaps.ts
git commit -m "feat: add server-side overlap resolver for PCB layout"
```

---

### Task 3: Integrate Overlap Resolver Into Chat Route

Wire the overlap resolver into the chat endpoint so it runs after validation detects overlap errors.

**Files:**
- Modify: `server/src/routes/chat.ts` (lines ~189-242)

**Context:** Currently when validation fails, the code enters a retry loop that asks the AI to fix the issues. For FOOTPRINT_OVERLAP errors specifically, we want to fix them algorithmically instead of burning API calls. The retry loop should still handle non-spatial errors.

**Step 1: Add import and integration**

At the top of `chat.ts`, add:
```typescript
import { resolveOverlaps } from "../lib/resolveOverlaps.js";
```

Then modify the validation block (around line 189-242). After line 193 (`const feedback = formatValidationFeedback(validation);`), add overlap resolution logic:

```typescript
// After: const feedback = formatValidationFeedback(validation);

// Check if the only errors are spatial (overlaps / boundary)
const hasOverlapErrors = validation.errors.some(e => e.code === "FOOTPRINT_OVERLAP" || e.code === "COMPONENT_OUT_OF_BOUNDS");
const hasNonSpatialErrors = validation.errors.some(e => e.code !== "FOOTPRINT_OVERLAP" && e.code !== "COMPONENT_OUT_OF_BOUNDS");

if (hasOverlapErrors && design) {
  // Fix overlaps algorithmically — don't waste API calls on spatial math
  const resolved = resolveOverlaps(design as Parameters<typeof resolveOverlaps>[0]);
  if (resolved) {
    console.log(`[chat] Overlap resolver fixed component positions`);
    // Re-serialize the fixed design back into the response text
    text = text.replace(/```json\s*[\s\S]*?```/, "```json\n" + JSON.stringify(design, null, 2) + "\n```");

    // Re-validate after resolver
    const recheck = validateDesign(design);
    if (recheck.valid || !hasNonSpatialErrors) {
      console.log(`[chat] Design valid after overlap resolution`);
      sendSSE(res, "replace", { text });
      res.end();
      return;
    }
    // If there are still non-spatial errors, fall through to retry loop
  }
}
```

The existing retry loop continues to handle non-spatial errors (missing pins, bad connections, etc.).

**Step 2: Verify TypeScript compiles**

Run: `npx tsc -p server/tsconfig.json --noEmit`
Expected: PASS

**Step 3: Manual test**

Start the server with `npm run dev:server` and send a chat message requesting a design with large components (e.g. "Design me a PCB with an Arduino Nano, a 16x2 LCD display, a DHT22 temperature sensor, and an HC-SR04 ultrasonic sensor"). Check server logs for `[chat] Overlap resolver fixed component positions`.

**Step 4: Commit**

```bash
git add server/src/routes/chat.ts
git commit -m "feat: integrate overlap resolver into chat validation pipeline"
```

---

### Task 4: PCB Layout Editor Component

The main new UI component — an SVG-based interactive PCB layout editor.

**Files:**
- Create: `src/components/PcbLayoutEditor.tsx`

**Context:** This replaces the placeholder PCB tab. It renders the board as a green rounded rectangle and each component as a colored, labeled, draggable rectangle. The user can drag components to rearrange them. Overlap warnings shown as red borders. Board boundary warnings shown as orange borders.

**Step 1: Create the PCB layout editor**

Create `src/components/PcbLayoutEditor.tsx`:

```tsx
import { useState, useRef, useCallback, useEffect } from "react";
import type { CircuitDesign, Component } from "../types/circuit";
import { getFootprint, getComponentBounds, rectanglesOverlap } from "../lib/footprintLookup";

interface Props {
  design: CircuitDesign;
  onUpdatePosition: (ref: string, x: number, y: number, rotation: number) => void;
}

/** Color map for component types */
const TYPE_COLORS: Record<string, string> = {
  ic: "#3b82f6",        // blue
  connector: "#ef4444", // red
  resistor: "#22c55e",  // green
  capacitor: "#a855f7", // purple
  led: "#eab308",       // yellow
  diode: "#f97316",     // orange
  mosfet: "#06b6d4",    // cyan
  switch: "#ec4899",    // pink
  regulator: "#14b8a6", // teal
};

const BOARD_MARGIN = 5; // mm margin around board in SVG viewBox

export default function PcbLayoutEditor({ design, onUpdatePosition }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState<{
    ref: string;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  const board = design.board;

  // Convert screen coordinates to SVG (board mm) coordinates
  const screenToBoard = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } => {
      const svg = svgRef.current;
      if (!svg) return { x: 0, y: 0 };
      const rect = svg.getBoundingClientRect();
      const viewW = (board.width + 2 * BOARD_MARGIN) / zoom;
      const viewH = (board.height + 2 * BOARD_MARGIN) / zoom;
      const x = ((clientX - rect.left) / rect.width) * viewW + pan.x;
      const y = ((clientY - rect.top) / rect.height) * viewH + pan.y;
      return { x, y };
    },
    [board.width, board.height, zoom, pan]
  );

  // Get the effective position of a component (drag position if being dragged)
  const getEffectivePosition = useCallback(
    (comp: Component) => {
      if (dragging && dragging.ref === comp.ref && dragPos) {
        return { x: dragPos.x, y: dragPos.y, rotation: comp.pcbPosition.rotation };
      }
      return comp.pcbPosition;
    },
    [dragging, dragPos]
  );

  // Check overlaps for all components
  const getOverlaps = useCallback(() => {
    const overlapping = new Set<string>();
    const comps = design.components;
    for (let i = 0; i < comps.length; i++) {
      for (let j = i + 1; j < comps.length; j++) {
        const posA = getEffectivePosition(comps[i]);
        const posB = getEffectivePosition(comps[j]);
        const fpA = getFootprint(comps[i].package, comps[i].type, comps[i].value);
        const fpB = getFootprint(comps[j].package, comps[j].type, comps[j].value);
        const boundsA = getComponentBounds(posA.x, posA.y, posA.rotation, fpA);
        const boundsB = getComponentBounds(posB.x, posB.y, posB.rotation, fpB);
        if (rectanglesOverlap(boundsA, boundsB)) {
          overlapping.add(comps[i].ref);
          overlapping.add(comps[j].ref);
        }
      }
    }
    return overlapping;
  }, [design.components, getEffectivePosition]);

  // Check if component is out of board bounds
  const isOutOfBounds = useCallback(
    (comp: Component) => {
      const pos = getEffectivePosition(comp);
      const fp = getFootprint(comp.package, comp.type, comp.value);
      const bounds = getComponentBounds(pos.x, pos.y, pos.rotation, fp);
      return bounds.left < 0 || bounds.top < 0 || bounds.right > board.width || bounds.bottom > board.height;
    },
    [board, getEffectivePosition]
  );

  const overlaps = getOverlaps();

  // Mouse handlers for dragging components
  const handleMouseDown = useCallback(
    (e: React.MouseEvent, comp: Component) => {
      if (e.button === 2) {
        // Right-click: rotate 90 degrees
        e.preventDefault();
        const newRotation = (comp.pcbPosition.rotation + 90) % 360;
        onUpdatePosition(comp.ref, comp.pcbPosition.x, comp.pcbPosition.y, newRotation);
        return;
      }
      if (e.button !== 0) return;
      e.stopPropagation();
      const boardCoord = screenToBoard(e.clientX, e.clientY);
      setDragging({
        ref: comp.ref,
        offsetX: boardCoord.x - comp.pcbPosition.x,
        offsetY: boardCoord.y - comp.pcbPosition.y,
      });
      setDragPos({ x: comp.pcbPosition.x, y: comp.pcbPosition.y });
    },
    [screenToBoard, onUpdatePosition]
  );

  // Global mouse handlers (on window to catch moves outside SVG)
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isPanning) {
        const dx = (e.clientX - panStart.current.x) * 0.5 / zoom;
        const dy = (e.clientY - panStart.current.y) * 0.5 / zoom;
        setPan({
          x: panStart.current.panX - dx,
          y: panStart.current.panY - dy,
        });
        return;
      }
      if (!dragging) return;
      const boardCoord = screenToBoard(e.clientX, e.clientY);
      setDragPos({
        x: Math.round((boardCoord.x - dragging.offsetX) * 10) / 10,
        y: Math.round((boardCoord.y - dragging.offsetY) * 10) / 10,
      });
    };

    const handleMouseUp = () => {
      if (isPanning) {
        setIsPanning(false);
        return;
      }
      if (dragging && dragPos) {
        onUpdatePosition(dragging.ref, dragPos.x, dragPos.y,
          design.components.find(c => c.ref === dragging.ref)?.pcbPosition.rotation ?? 0);
        setDragging(null);
        setDragPos(null);
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragging, dragPos, isPanning, zoom, screenToBoard, onUpdatePosition, design.components]);

  // Zoom with mouse wheel
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(z => Math.max(0.2, Math.min(5, z * factor)));
  }, []);

  // Pan with middle-click or shift+click on background
  const handleBackgroundMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
      e.preventDefault();
      setIsPanning(true);
      panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    }
  }, [pan]);

  // SVG viewBox calculation
  const viewW = (board.width + 2 * BOARD_MARGIN) / zoom;
  const viewH = (board.height + 2 * BOARD_MARGIN) / zoom;
  const viewBox = `${pan.x - BOARD_MARGIN / zoom} ${pan.y - BOARD_MARGIN / zoom} ${viewW} ${viewH}`;

  return (
    <div className="w-full h-full bg-gray-100 overflow-hidden" onContextMenu={e => e.preventDefault()}>
      <svg
        ref={svgRef}
        className="w-full h-full"
        viewBox={viewBox}
        onWheel={handleWheel}
        onMouseDown={handleBackgroundMouseDown}
      >
        {/* Board outline */}
        <rect
          x={0}
          y={0}
          width={board.width}
          height={board.height}
          rx={board.cornerRadius}
          ry={board.cornerRadius}
          fill="#1a5c2a"
          stroke="#0f3d1a"
          strokeWidth={0.5}
        />

        {/* Components */}
        {design.components.map(comp => {
          const pos = getEffectivePosition(comp);
          const fp = getFootprint(comp.package, comp.type, comp.value);
          const totalW = fp.width + 2 * fp.keepout;
          const totalH = fp.height + 2 * fp.keepout;
          const rot = ((pos.rotation % 360) + 360) % 360;
          const swapped = rot === 90 || rot === 270;
          const w = swapped ? totalH : totalW;
          const h = swapped ? totalW : totalH;
          const color = TYPE_COLORS[comp.type] || "#6b7280";
          const isOverlapping = overlaps.has(comp.ref);
          const outOfBounds = isOutOfBounds(comp);
          const isDraggingThis = dragging?.ref === comp.ref;

          return (
            <g
              key={comp.ref}
              transform={`translate(${pos.x}, ${pos.y})`}
              onMouseDown={e => handleMouseDown(e, comp)}
              style={{ cursor: isDraggingThis ? "grabbing" : "grab" }}
            >
              {/* Component body */}
              <rect
                x={-w / 2}
                y={-h / 2}
                width={w}
                height={h}
                fill={color}
                fillOpacity={0.3}
                stroke={isOverlapping ? "#ef4444" : outOfBounds ? "#f97316" : color}
                strokeWidth={isOverlapping || outOfBounds ? 0.8 : 0.4}
                strokeDasharray={isOverlapping ? "2 1" : outOfBounds ? "2 1" : "none"}
                rx={0.5}
              />
              {/* Ref label */}
              <text
                x={0}
                y={-1}
                textAnchor="middle"
                dominantBaseline="auto"
                fontSize={Math.min(3, w * 0.2)}
                fill="#1f2937"
                fontWeight="bold"
                style={{ pointerEvents: "none", userSelect: "none" }}
              >
                {comp.ref}
              </text>
              {/* Value label */}
              <text
                x={0}
                y={2.5}
                textAnchor="middle"
                dominantBaseline="auto"
                fontSize={Math.min(2.5, w * 0.15)}
                fill="#4b5563"
                style={{ pointerEvents: "none", userSelect: "none" }}
              >
                {comp.value.length > 15 ? comp.value.slice(0, 14) + "…" : comp.value}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add src/components/PcbLayoutEditor.tsx
git commit -m "feat: add interactive SVG-based PCB layout editor"
```

---

### Task 5: Wire Up DesignViewer — Tab Reorder and PCB Editor

Replace the PCB placeholder tab with the new editor and reorder tabs.

**Files:**
- Modify: `src/components/DesignViewer.tsx`

**Step 1: Update DesignViewer**

Changes needed in `DesignViewer.tsx`:

1. Add import at top:
```typescript
import PcbLayoutEditor from "./PcbLayoutEditor";
```

2. Add `onUpdatePosition` to Props interface:
```typescript
interface Props {
  design: CircuitDesign | null;
  onCheckDesign?: () => void;
  checking?: boolean;
  checkFindings?: CheckFinding[];
  checkAiText?: string;
  onCloseCheck?: () => void;
  onUpdatePosition?: (ref: string, x: number, y: number, rotation: number) => void;
}
```

3. Add to destructured props:
```typescript
export default function DesignViewer({
  design,
  onCheckDesign,
  checking = false,
  checkFindings = [],
  checkAiText = "",
  onCloseCheck,
  onUpdatePosition,
}: Props) {
```

4. Change default tab from `"3d"` to `"pcb"` (line 26):
```typescript
const [activeTab, setActiveTab] = useState<Tab>("pcb");
```

5. Replace the PCB/Schematic placeholder section (lines 111-186). The content area should now be:
```tsx
{/* Content */}
<div className="flex-1 overflow-hidden">
  {showCheckPanel ? (
    <DesignCheckPanel ... />
  ) : !design ? (
    <div className="flex items-center justify-center h-full text-gray-400">
      ...empty state...
    </div>
  ) : activeTab === "3d" ? (
    <ThreeDRenderer design={design} />
  ) : activeTab === "pcb" ? (
    <PcbLayoutEditor
      design={design}
      onUpdatePosition={onUpdatePosition ?? (() => {})}
    />
  ) : (
    <div className="p-6 overflow-auto h-full">
      ...schematic placeholder (keep existing)...
    </div>
  )}
</div>
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add src/components/DesignViewer.tsx
git commit -m "feat: wire PCB layout editor into DesignViewer, default to PCB tab"
```

---

### Task 6: Wire Up App.tsx — Mutable Design State

Add the position update callback to App.tsx so the PCB editor can modify component positions.

**Files:**
- Modify: `src/App.tsx`

**Step 1: Add handleUpdatePosition and pass it down**

Add a new function in App.tsx (after `handleNewDesign`):

```typescript
const handleUpdatePosition = (ref: string, x: number, y: number, rotation: number) => {
  setCurrentDesign(prev => {
    if (!prev) return prev;
    return {
      ...prev,
      components: prev.components.map(c =>
        c.ref === ref ? { ...c, pcbPosition: { x, y, rotation } } : c
      ),
    };
  });
};
```

Pass it to DesignViewer:

```tsx
<DesignViewer
  design={currentDesign}
  onCheckDesign={handleCheckDesign}
  checking={checking}
  checkFindings={checkFindings}
  checkAiText={checkAiText}
  onCloseCheck={clearCheckResults}
  onUpdatePosition={handleUpdatePosition}
/>
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: add mutable design state for PCB layout position updates"
```

---

### Task 7: End-to-End Verification

Verify everything works together.

**Step 1: Full TypeScript build**

Run: `npx tsc -b && npx tsc -p server/tsconfig.json --noEmit`
Expected: PASS on both

**Step 2: Start dev server**

Run: `npm run dev`
Expected: Both Vite and server start without errors

**Step 3: Manual test — design generation**

1. Open the app in browser
2. Send: "Design me a PCB with an Arduino Nano, a 16x2 LCD display, a DHT22 temperature sensor, and an HC-SR04 ultrasonic sensor, powered by USB-C"
3. Verify the PCB tab opens by default (not 3D)
4. Verify components appear as colored rectangles on the green board
5. Verify no overlaps (overlap resolver should have fixed them)
6. Check server console for `[chat] Overlap resolver fixed component positions` log

**Step 4: Manual test — drag interaction**

1. Click and drag a component (e.g. the DHT22)
2. Verify it follows the mouse smoothly
3. Drop it overlapping another component
4. Verify red dashed border appears on overlapping components
5. Switch to 3D tab — verify the component appears at its new position

**Step 5: Manual test — rotation**

1. Right-click a component
2. Verify it rotates 90 degrees (rectangle dimensions swap visually)

**Step 6: Commit all remaining changes (if any fixups needed)**

```bash
git add -A
git commit -m "fix: end-to-end verification fixups for PCB layout editor"
```
