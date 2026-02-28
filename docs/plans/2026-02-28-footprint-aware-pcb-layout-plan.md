# Footprint-Aware PCB Layout Engine — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Teach DuckTape EDA real component dimensions so PCB layouts never have overlapping components, and Claude can reason spatially about placement.

**Architecture:** AI-first approach — add footprint dimension data to the component library, inject it into the system prompt so Claude reasons about physical sizes, and upgrade the validator to catch overlaps using bounding-box collision detection. The existing validate-retry loop provides the self-correction mechanism.

**Tech Stack:** TypeScript (server-side), no new dependencies needed.

**Design doc:** `docs/plans/2026-02-28-footprint-aware-pcb-layout-design.md`

---

### Task 1: Add Footprint interface and data to component library

**Files:**
- Modify: `server/src/lib/componentLibrary.ts:11-38` (interfaces)
- Modify: `server/src/lib/componentLibrary.ts:41-1180` (component definitions)

**Step 1: Add the Footprint interface**

Add below the `LibraryPin` interface (after line 15) and update `LibraryComponent` to include a `footprint` field:

```typescript
export interface Footprint {
  /** Body width in mm (x-axis when rotation=0) */
  width: number;
  /** Body height in mm (y-axis when rotation=0) */
  height: number;
  /** Clearance zone in mm around the body (for pads, leads, soldering access) */
  keepout: number;
}
```

Add to `LibraryComponent` interface (after the `tags` field):

```typescript
  /** Physical footprint dimensions for PCB layout collision detection */
  footprint: Footprint;
```

**Step 2: Add footprint data to every component**

Add a `footprint` field to every component in the library. Use these values:

| Component(s) | Package | footprint |
|---|---|---|
| `RES_TH` | Axial_TH | `{ width: 9.0, height: 3.0, keepout: 1.5 }` |
| `RES_0805` | 0805 | `{ width: 2.0, height: 1.25, keepout: 0.5 }` |
| `CAP_CERAMIC_TH`, `CAP_ELECTROLYTIC_TH`, `PWR_FUSE_RESETTABLE` | Radial_TH | `{ width: 5.0, height: 5.0, keepout: 1.0 }` |
| `CAP_0805` | 0805 | `{ width: 2.0, height: 1.25, keepout: 0.5 }` |
| `LED_5MM_TH` | 5mm_TH | `{ width: 5.0, height: 5.0, keepout: 1.0 }` |
| `LED_0805` | 0805 | `{ width: 2.0, height: 1.25, keepout: 0.5 }` |
| `DIODE_1N4148` | DO-35_TH | `{ width: 7.0, height: 2.5, keepout: 1.5 }` |
| `DIODE_1N4007`, `DIODE_SCHOTTKY_1N5819` | DO-41_TH | `{ width: 9.0, height: 3.0, keepout: 1.5 }` |
| `CONN_USB_C_POWER` | USB_C_Receptacle | `{ width: 9.0, height: 7.5, keepout: 1.0 }` |
| `CONN_PIN_HEADER_2` | PinHeader_1x2 | `{ width: 5.08, height: 2.54, keepout: 1.0 }` |
| `CONN_PIN_HEADER_4` | PinHeader_1x4 | `{ width: 10.16, height: 2.54, keepout: 1.0 }` |
| `CONN_PIN_HEADER_6` | PinHeader_1x6 | `{ width: 15.24, height: 2.54, keepout: 1.0 }` |
| `CONN_BARREL_JACK` | BarrelJack_TH | `{ width: 14.0, height: 9.0, keepout: 1.0 }` |
| `CONN_SCREW_TERM_2` | ScrewTerminal | `{ width: 10.16, height: 7.5, keepout: 1.0 }` |
| `CONN_JST_PH_3` | JST_PH 3-pin | `{ width: 8.0, height: 6.0, keepout: 1.0 }` |
| `CONN_JST_PH_4` | JST_PH 4-pin | `{ width: 10.0, height: 6.0, keepout: 1.0 }` |
| `REG_AMS1117_3V3` | SOT-223 | `{ width: 6.5, height: 3.5, keepout: 0.5 }` |
| `REG_7805` | TO-220_TH | `{ width: 10.0, height: 4.5, keepout: 1.5 }` |
| `SW_TACTILE_6MM` | SW_Push_6mm_TH | `{ width: 6.0, height: 6.0, keepout: 1.0 }` |
| `SW_SLIDE_SPDT` | SW_Slide_SPDT_TH | `{ width: 8.5, height: 3.5, keepout: 1.0 }` |
| `MOSFET_IRLZ44N` | TO-220_TH | `{ width: 10.0, height: 4.5, keepout: 1.5 }` |
| `MOSFET_2N7000` | TO-92_TH | `{ width: 4.5, height: 3.5, keepout: 1.0 }` |
| `IC_NE555_TH` | DIP-8 | `{ width: 10.0, height: 7.0, keepout: 1.0 }` |
| `IC_ATMEGA328P` | DIP-28 | `{ width: 36.0, height: 7.5, keepout: 1.5 }` |
| `IC_ESP32_DEVKIT` | Module_DIP | `{ width: 52.0, height: 28.0, keepout: 1.5 }` |
| `LED_WS2812B` | LED_SMD_5050 | `{ width: 5.0, height: 5.0, keepout: 0.5 }` |
| `SENSOR_DHT22` | SIP-4_TH | `{ width: 15.0, height: 20.0, keepout: 1.5 }` |
| `SENSOR_BME280` | Module_4pin | `{ width: 13.0, height: 10.0, keepout: 1.0 }` |
| `SENSOR_MPU6050` | Module_8pin | `{ width: 20.0, height: 16.0, keepout: 1.0 }` |
| `SENSOR_HC_SR04` | Module_4pin | `{ width: 45.0, height: 20.0, keepout: 1.5 }` |
| `SENSOR_PHOTORESISTOR` | LDR_TH | `{ width: 5.0, height: 5.0, keepout: 1.0 }` |
| `SENSOR_IR_RECEIVER` | TO-92_TH | `{ width: 4.5, height: 3.5, keepout: 1.0 }` |
| `SENSOR_PIR` | Module_3pin | `{ width: 32.0, height: 24.0, keepout: 1.5 }` |
| `COMM_NRF24L01` | Module_8pin | `{ width: 29.0, height: 15.0, keepout: 1.0 }` |
| `COMM_RFM95W` | Module_16pin | `{ width: 23.0, height: 16.0, keepout: 1.0 }` |
| `COMM_HC05` | Module_6pin | `{ width: 27.0, height: 13.0, keepout: 1.0 }` |
| `PWR_TP4056` | Module_6pin | `{ width: 26.0, height: 17.0, keepout: 1.0 }` |
| `PWR_MT3608` | Module_4pin | `{ width: 36.0, height: 17.0, keepout: 1.0 }` |
| `PWR_BATTERY_HOLDER_AA_2` | BatteryHolder_2xAA | `{ width: 58.0, height: 31.0, keepout: 2.0 }` |
| `PWR_BATTERY_HOLDER_18650` | BatteryHolder_18650 | `{ width: 77.0, height: 21.0, keepout: 2.0 }` |
| `DISP_SSD1306_OLED` | Module_4pin | `{ width: 27.0, height: 27.0, keepout: 1.0 }` |
| `DISP_LCD_1602_I2C` | Module_4pin | `{ width: 80.0, height: 36.0, keepout: 1.5 }` |
| `AUDIO_PIEZO_BUZZER`, `AUDIO_PASSIVE_BUZZER` | Buzzer_12mm_TH | `{ width: 12.0, height: 12.0, keepout: 1.0 }` |
| `MOTOR_DRV8833` | Module_10pin | `{ width: 18.0, height: 15.0, keepout: 1.0 }` |
| `MOTOR_TB6612FNG` | Module_16pin | `{ width: 20.0, height: 20.0, keepout: 1.0 }` |
| `IC_RP2040_PICO` | Module_DIP_40pin | `{ width: 51.0, height: 21.0, keepout: 1.5 }` |
| `IC_ARDUINO_NANO` | Module_DIP_30pin | `{ width: 43.0, height: 18.0, keepout: 1.5 }` |
| `CRYSTAL_16MHZ` | HC49_TH | `{ width: 11.0, height: 5.0, keepout: 1.0 }` |
| `POT_10K_TH` | Potentiometer_TH | `{ width: 10.0, height: 10.0, keepout: 1.5 }` |
| `TVS_SMBJ5V0A` | SMB | `{ width: 4.5, height: 3.5, keepout: 0.5 }` |
| `IC_74HC595`, `IC_PCF8574` | DIP-16 | `{ width: 20.0, height: 7.5, keepout: 1.0 }` |

**Step 3: Verify it compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add server/src/lib/componentLibrary.ts
git commit -m "feat: add footprint dimensions to component library"
```

---

### Task 2: Create footprint lookup utility for validation

**Files:**
- Create: `server/src/lib/footprintTable.ts`

This is a standalone lookup table that the validator uses to find footprint dimensions for any component, independent of the library. This handles two cases: (1) components from the library, and (2) components Claude creates that aren't in the library.

**Step 1: Create the footprint table**

Create `server/src/lib/footprintTable.ts`:

```typescript
/**
 * Footprint dimension lookup for PCB layout validation.
 *
 * Maps package names to physical dimensions (width, height, keepout in mm).
 * Used by the validator to compute bounding rectangles for overlap detection.
 */

export interface FootprintDimensions {
  width: number;
  height: number;
  keepout: number;
}

/**
 * Known package dimensions. Keys are package names (or prefixes).
 * Values are { width, height, keepout } in mm.
 */
const PACKAGE_FOOTPRINTS: Record<string, FootprintDimensions> = {
  // Passive through-hole
  "Axial_TH":                { width: 9.0, height: 3.0, keepout: 1.5 },
  "Radial_TH":               { width: 5.0, height: 5.0, keepout: 1.0 },
  "DO-35_TH":                { width: 7.0, height: 2.5, keepout: 1.5 },
  "DO-41_TH":                { width: 9.0, height: 3.0, keepout: 1.5 },

  // SMD passives
  "0805":                    { width: 2.0, height: 1.25, keepout: 0.5 },
  "0603":                    { width: 1.6, height: 0.8, keepout: 0.5 },
  "1206":                    { width: 3.2, height: 1.6, keepout: 0.5 },
  "SMB":                     { width: 4.5, height: 3.5, keepout: 0.5 },

  // LEDs
  "5mm_TH":                  { width: 5.0, height: 5.0, keepout: 1.0 },
  "3mm_TH":                  { width: 3.0, height: 3.0, keepout: 1.0 },
  "LED_SMD_5050":            { width: 5.0, height: 5.0, keepout: 0.5 },

  // Connectors
  "USB_C_Receptacle":        { width: 9.0, height: 7.5, keepout: 1.0 },
  "BarrelJack_TH":           { width: 14.0, height: 9.0, keepout: 1.0 },
  "ScrewTerminal_1x2_P5.08mm": { width: 10.16, height: 7.5, keepout: 1.0 },

  // Semiconductors
  "SOT-223":                 { width: 6.5, height: 3.5, keepout: 0.5 },
  "SOT-23":                  { width: 3.0, height: 1.4, keepout: 0.5 },
  "TO-220_TH":               { width: 10.0, height: 4.5, keepout: 1.5 },
  "TO-92_TH":                { width: 4.5, height: 3.5, keepout: 1.0 },

  // DIP ICs
  "DIP-8":                   { width: 10.0, height: 7.0, keepout: 1.0 },
  "DIP-16":                  { width: 20.0, height: 7.5, keepout: 1.0 },
  "DIP-28":                  { width: 36.0, height: 7.5, keepout: 1.5 },

  // Switches
  "SW_Push_6mm_TH":          { width: 6.0, height: 6.0, keepout: 1.0 },
  "SW_Slide_SPDT_TH":        { width: 8.5, height: 3.5, keepout: 1.0 },

  // Through-hole misc
  "HC49_TH":                 { width: 11.0, height: 5.0, keepout: 1.0 },
  "Potentiometer_TH":        { width: 10.0, height: 10.0, keepout: 1.5 },
  "Buzzer_12mm_TH":          { width: 12.0, height: 12.0, keepout: 1.0 },
  "SIP-4_TH":                { width: 15.0, height: 20.0, keepout: 1.5 },
  "LDR_TH":                  { width: 5.0, height: 5.0, keepout: 1.0 },

  // Modules (breakout boards)
  "Module_DIP":              { width: 52.0, height: 28.0, keepout: 1.5 },
  "Module_DIP_40pin":        { width: 51.0, height: 21.0, keepout: 1.5 },
  "Module_DIP_30pin":        { width: 43.0, height: 18.0, keepout: 1.5 },
  "Module_4pin":             { width: 13.0, height: 10.0, keepout: 1.0 },
  "Module_3pin":             { width: 32.0, height: 24.0, keepout: 1.5 },
  "Module_6pin":             { width: 27.0, height: 13.0, keepout: 1.0 },
  "Module_8pin":             { width: 20.0, height: 16.0, keepout: 1.0 },
  "Module_10pin":            { width: 18.0, height: 15.0, keepout: 1.0 },
  "Module_16pin":            { width: 23.0, height: 16.0, keepout: 1.0 },

  // Battery holders
  "BatteryHolder_2xAA":      { width: 58.0, height: 31.0, keepout: 2.0 },
  "BatteryHolder_18650":     { width: 77.0, height: 21.0, keepout: 2.0 },
};

/**
 * Default footprint dimensions by component type, used as last-resort fallback.
 */
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

/** Absolute fallback when nothing else matches */
const GENERIC_FALLBACK: FootprintDimensions = { width: 10.0, height: 10.0, keepout: 1.0 };

/**
 * Look up footprint dimensions for a component.
 *
 * Resolution order:
 * 1. Exact package name match in PACKAGE_FOOTPRINTS
 * 2. Prefix match (e.g. "PinHeader_1x4_P2.54mm" matches "PinHeader")
 * 3. Component type default (e.g. all resistors → Axial_TH size)
 * 4. Generic fallback (10x10mm)
 */
export function getFootprint(pkg: string, type?: string): FootprintDimensions {
  // 1. Exact match
  if (PACKAGE_FOOTPRINTS[pkg]) {
    return PACKAGE_FOOTPRINTS[pkg];
  }

  // 2. Prefix match — handles PinHeader_1xN_P2.54mm, JST_PH_SxB-PH-K_1xN...
  //    Also handle special pin-header sizing based on pin count
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

  // 3. Check for prefix matches in known packages
  for (const [key, dims] of Object.entries(PACKAGE_FOOTPRINTS)) {
    if (pkg.startsWith(key)) {
      return dims;
    }
  }

  // 4. Type-based default
  if (type && TYPE_DEFAULTS[type]) {
    return TYPE_DEFAULTS[type];
  }

  // 5. Generic fallback
  return GENERIC_FALLBACK;
}

/**
 * Compute the axis-aligned bounding rectangle of a component on the PCB,
 * accounting for rotation.
 *
 * Returns { left, top, right, bottom } in mm, where (left, top) is the
 * min-coordinate corner and (right, bottom) is the max-coordinate corner.
 */
export function getComponentBounds(
  x: number,
  y: number,
  rotation: number,
  footprint: FootprintDimensions
): { left: number; top: number; right: number; bottom: number } {
  const totalW = footprint.width + 2 * footprint.keepout;
  const totalH = footprint.height + 2 * footprint.keepout;

  // Normalize rotation to 0/90/180/270
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

/**
 * Compute the gap between two axis-aligned rectangles.
 * Returns 0 if they overlap, otherwise the minimum edge-to-edge distance.
 */
export function rectangleGap(
  a: { left: number; top: number; right: number; bottom: number },
  b: { left: number; top: number; right: number; bottom: number }
): number {
  if (rectanglesOverlap(a, b)) return 0;

  const gapX = Math.max(0, Math.max(a.left - b.right, b.left - a.right));
  const gapY = Math.max(0, Math.max(a.top - b.bottom, b.top - a.bottom));

  // If both gaps are > 0, rectangles are diagonal — return Euclidean distance
  if (gapX > 0 && gapY > 0) {
    return Math.sqrt(gapX * gapX + gapY * gapY);
  }
  // Otherwise return the non-zero gap (one axis must have a gap)
  return Math.max(gapX, gapY);
}
```

**Step 2: Verify it compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add server/src/lib/footprintTable.ts
git commit -m "feat: add footprint lookup table with bounding-box geometry utils"
```

---

### Task 3: Replace overlap check with bounding-box collision detection

**Files:**
- Modify: `server/src/lib/validateDesign.ts:361-375` (overlap check)
- Modify: `server/src/lib/validateDesign.ts:302-310` (board boundary check)

**Step 1: Add import for footprint utilities**

At the top of `validateDesign.ts`, add:

```typescript
import { getFootprint, getComponentBounds, rectanglesOverlap, rectangleGap } from "./footprintTable.js";
```

**Step 2: Replace the overlap check (lines 361-375)**

Replace the existing naive distance-based overlap check with bounding-box collision detection:

```typescript
  // ─── FOOTPRINT-AWARE OVERLAP CHECK ───────────────────────
  const MIN_GAP = 0.5; // mm — minimum gap between component footprints
  for (let i = 0; i < components.length; i++) {
    for (let j = i + 1; j < components.length; j++) {
      const a = components[i];
      const b = components[j];
      if (!isValidPosition(a.pcbPosition) || !isValidPosition(b.pcbPosition)) continue;

      const fpA = getFootprint(a.package, a.type);
      const fpB = getFootprint(b.package, b.type);
      const boundsA = getComponentBounds(a.pcbPosition.x, a.pcbPosition.y, a.pcbPosition.rotation, fpA);
      const boundsB = getComponentBounds(b.pcbPosition.x, b.pcbPosition.y, b.pcbPosition.rotation, fpB);

      const totalA = `${(fpA.width + 2 * fpA.keepout).toFixed(1)}x${(fpA.height + 2 * fpA.keepout).toFixed(1)}mm`;
      const totalB = `${(fpB.width + 2 * fpB.keepout).toFixed(1)}x${(fpB.height + 2 * fpB.keepout).toFixed(1)}mm`;

      if (rectanglesOverlap(boundsA, boundsB)) {
        // Compute minimum displacement to separate
        const overlapRight = boundsA.right - boundsB.left;
        const overlapLeft = boundsB.right - boundsA.left;
        const overlapDown = boundsA.bottom - boundsB.top;
        const overlapUp = boundsB.bottom - boundsA.top;
        const minShift = Math.min(overlapRight, overlapLeft, overlapDown, overlapUp);

        issues.push({
          severity: "error",
          code: "FOOTPRINT_OVERLAP",
          message: `${a.ref} (${totalA} footprint) overlaps ${b.ref} (${totalB} footprint). ` +
            `${a.ref} occupies [${boundsA.left.toFixed(1)},${boundsA.top.toFixed(1)}]-[${boundsA.right.toFixed(1)},${boundsA.bottom.toFixed(1)}], ` +
            `${b.ref} occupies [${boundsB.left.toFixed(1)},${boundsB.top.toFixed(1)}]-[${boundsB.right.toFixed(1)},${boundsB.bottom.toFixed(1)}]. ` +
            `Move one component at least ${(minShift + MIN_GAP).toFixed(1)}mm to clear.`,
          ref: a.ref,
        });
      } else {
        const gap = rectangleGap(boundsA, boundsB);
        if (gap < MIN_GAP) {
          issues.push({
            severity: "warning",
            code: "TIGHT_CLEARANCE",
            message: `${a.ref} (${totalA}) and ${b.ref} (${totalB}) have only ${gap.toFixed(1)}mm clearance — minimum recommended is ${MIN_GAP}mm.`,
            ref: a.ref,
          });
        }
      }
    }
  }
```

**Step 3: Upgrade the board boundary check (lines 302-310)**

Replace the current center-point-only check with footprint-aware boundary checking:

```typescript
    // Check component footprints fit on board
    if (board.width > 0 && board.height > 0) {
      for (const comp of components) {
        if (!isValidPosition(comp.pcbPosition)) continue;
        const fp = getFootprint(comp.package, comp.type);
        const bounds = getComponentBounds(comp.pcbPosition.x, comp.pcbPosition.y, comp.pcbPosition.rotation, fp);

        // Connectors are allowed to overhang — they mount at board edges
        if (comp.type === "connector") {
          // Just check that at least half the connector is on the board
          const centerOnBoard = comp.pcbPosition.x >= 0 && comp.pcbPosition.x <= board.width &&
                                comp.pcbPosition.y >= 0 && comp.pcbPosition.y <= board.height;
          if (!centerOnBoard) {
            issues.push({ severity: "warning", code: "COMP_OFF_BOARD", message: `Connector ${comp.ref} center is outside board bounds (${board.width}x${board.height}mm)`, ref: comp.ref });
          }
        } else {
          // Non-connectors: entire footprint must be on the board
          if (bounds.left < -0.5 || bounds.right > board.width + 0.5 || bounds.top < -0.5 || bounds.bottom > board.height + 0.5) {
            const totalW = (fp.width + 2 * fp.keepout).toFixed(1);
            const totalH = (fp.height + 2 * fp.keepout).toFixed(1);
            issues.push({
              severity: "warning",
              code: "FOOTPRINT_OFF_BOARD",
              message: `${comp.ref} footprint (${totalW}x${totalH}mm) extends outside board bounds. Bounds: [${bounds.left.toFixed(1)},${bounds.top.toFixed(1)}]-[${bounds.right.toFixed(1)},${bounds.bottom.toFixed(1)}] on a ${board.width}x${board.height}mm board. Move it inward or increase board size.`,
              ref: comp.ref,
            });
          }
        }
      }
    }
```

**Step 4: Verify it compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add server/src/lib/validateDesign.ts
git commit -m "feat: replace naive overlap check with footprint-aware bounding-box collision detection"
```

---

### Task 4: Update formatLibraryForPrompt to include footprint dimensions

**Files:**
- Modify: `server/src/lib/componentLibrary.ts:1214-1239` (`formatLibraryForPrompt` function)

**Step 1: Update the format function**

Update `formatLibraryForPrompt()` to include footprint dimensions in the output:

```typescript
export function formatLibraryForPrompt(): string {
  const grouped = new Map<string, LibraryComponent[]>();
  for (const comp of COMPONENT_LIBRARY) {
    const list = grouped.get(comp.type) || [];
    list.push(comp);
    grouped.set(comp.type, list);
  }

  const lines: string[] = [];
  for (const [type, comps] of grouped) {
    lines.push(`\n### ${type.toUpperCase()}S`);
    for (const c of comps) {
      const pinStr = c.pins.map((p) => `${p.id}:${p.name}(${p.type})`).join(", ");
      const fp = c.footprint;
      const totalW = (fp.width + 2 * fp.keepout).toFixed(1);
      const totalH = (fp.height + 2 * fp.keepout).toFixed(1);
      lines.push(`- **${c.id}**: ${c.name} [${c.package}]`);
      lines.push(`  Footprint: ${fp.width}x${fp.height}mm body, ${fp.keepout}mm keepout → ${totalW}x${totalH}mm total`);
      lines.push(`  Pins: ${pinStr}`);
      if (c.partNumber) lines.push(`  MPN: ${c.partNumber}`);
      if (c.specs) {
        const specStr = Object.entries(c.specs).map(([k, v]) => `${k}=${v}`).join(", ");
        lines.push(`  Specs: ${specStr}`);
      }
      lines.push(`  ${c.description}`);
    }
  }

  return lines.join("\n");
}
```

**Step 2: Verify it compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add server/src/lib/componentLibrary.ts
git commit -m "feat: include footprint dimensions in system prompt library listing"
```

---

### Task 5: Update system prompt with footprint-aware placement rules

**Files:**
- Modify: `server/src/lib/buildPrompt.ts:87-104` (Physical/PCB Rules section)

**Step 1: Replace the placement rules**

In `buildPrompt.ts`, replace the Physical/PCB Rules section (lines 87-104) with footprint-aware rules:

```
**Physical/PCB Rules:**
- **Footprint-aware placement (CRITICAL):** Each component has a total footprint (body + keepout zone) listed in the library above. When placing components, ensure their total footprints DO NOT overlap. The minimum gap between the edges of any two component footprints is 0.5mm. Calculate placement by checking that no two bounding rectangles (accounting for rotation) intersect.
- **Placement workflow:**
  1. Place connectors at board edges first (they're anchored to edges)
  2. Place the largest non-connector component (e.g. Arduino Nano, OLED display) near the board center
  3. Place remaining components around it, checking each placement doesn't overlap any already-placed component
  4. Related components go near each other (e.g. decoupling cap near its IC, pull-up resistor near its sensor)
  5. Size the board to fit all component footprints with 2-3mm margin on each side
- All components must fit within board boundaries (entire footprint, not just center point)
- **CENTER components on the board** — don't cluster everything in one corner. The component group should be roughly centered within the board outline.
- When the user asks for a shape change (slimmer, thinner, more rectangular, smaller), adjust the board dimensions AND reposition ALL component pcbPositions to stay centered and balanced within the new shape. Verify no footprints overlap after repositioning.
- Prefer through-hole packages for hobbyist builds (easier to solder)
- Use SMD only when through-hole isn't practical (e.g. USB-C connectors, LDO regulators)
- PCB positions are in millimeters, representing physical placement on the board
- **CONNECTORS MUST be placed at board edges** — this is how real PCBs work. The plug/cable must be accessible from outside the board:
  - USB connectors: place at x=0 (left edge) or x=board.width (right edge), with the opening facing outward off the board edge
  - Barrel jacks: place at a board edge
  - Pin headers: place at a board edge or near one
  - JST connectors: place at a board edge, with the opening facing outward
  - Screw terminals: place at a board edge
  - The connector's pcbPosition.y should be roughly centered along the edge, and pcbPosition.x should be at 0 or board.width
  - Use rotation to orient the connector opening toward the outside of the board
```

**Step 2: Verify it compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add server/src/lib/buildPrompt.ts
git commit -m "feat: add footprint-aware placement rules and workflow to system prompt"
```

---

### Task 6: Add spatial map generation for validation feedback

**Files:**
- Modify: `server/src/lib/validateDesign.ts` (add new exported function)

**Step 1: Add the spatial map generator**

Add a new exported function at the end of `validateDesign.ts` (before the closing of the file):

```typescript
/**
 * Generate an ASCII spatial map of component placement on the board.
 * Used in validation retry feedback so Claude can "see" the board layout.
 */
export function generateSpatialMap(design: CircuitDesign): string {
  const board = design.board;
  if (!board || board.width <= 0 || board.height <= 0) return "";

  const components = design.components;
  if (!components || components.length === 0) return "";

  // Import at function level to avoid circular deps — already imported at top
  // Build component bounds list
  const compBounds: {
    ref: string;
    value: string;
    bounds: { left: number; top: number; right: number; bottom: number };
    totalW: number;
    totalH: number;
  }[] = [];

  for (const comp of components) {
    if (!isValidPosition(comp.pcbPosition)) continue;
    const fp = getFootprint(comp.package, comp.type);
    const bounds = getComponentBounds(
      comp.pcbPosition.x, comp.pcbPosition.y,
      comp.pcbPosition.rotation, fp
    );
    compBounds.push({
      ref: comp.ref,
      value: comp.value,
      bounds,
      totalW: fp.width + 2 * fp.keepout,
      totalH: fp.height + 2 * fp.keepout,
    });
  }

  // Build a text summary rather than trying to draw ASCII art at exact scale
  // (ASCII art at scale would be illegible for most board sizes)
  const lines: string[] = [];
  lines.push(`BOARD LAYOUT (${board.width}x${board.height}mm):`);
  lines.push("");
  lines.push("Component positions and footprints:");
  for (const c of compBounds) {
    lines.push(`  ${c.ref} (${c.value}): ${c.totalW.toFixed(1)}x${c.totalH.toFixed(1)}mm at center (${((c.bounds.left + c.bounds.right) / 2).toFixed(1)}, ${((c.bounds.top + c.bounds.bottom) / 2).toFixed(1)}) → occupies [${c.bounds.left.toFixed(1)},${c.bounds.top.toFixed(1)}]-[${c.bounds.right.toFixed(1)},${c.bounds.bottom.toFixed(1)}]`);
  }

  // Find overlaps and report them
  const overlaps: string[] = [];
  for (let i = 0; i < compBounds.length; i++) {
    for (let j = i + 1; j < compBounds.length; j++) {
      if (rectanglesOverlap(compBounds[i].bounds, compBounds[j].bounds)) {
        overlaps.push(`  ⚠ ${compBounds[i].ref} overlaps ${compBounds[j].ref}`);
      }
    }
  }
  if (overlaps.length > 0) {
    lines.push("");
    lines.push("OVERLAPS DETECTED:");
    lines.push(...overlaps);
  }

  // Suggest free zones — find large empty rectangles on the board
  // Simple approach: check grid of candidate positions
  lines.push("");
  lines.push("Available space (approximate free zones):");
  const gridStep = Math.max(2, Math.min(board.width, board.height) / 10);
  const freeZones: string[] = [];
  for (let gx = gridStep; gx < board.width - gridStep; gx += gridStep) {
    for (let gy = gridStep; gy < board.height - gridStep; gy += gridStep) {
      const testRect = { left: gx - 3, top: gy - 3, right: gx + 3, bottom: gy + 3 };
      const blocked = compBounds.some(c => rectanglesOverlap(c.bounds, testRect));
      if (!blocked && freeZones.length < 5) {
        freeZones.push(`  ~(${gx.toFixed(0)}, ${gy.toFixed(0)}) has clearance`);
      }
    }
  }
  if (freeZones.length > 0) {
    lines.push(...freeZones);
  } else {
    lines.push("  Board is densely packed — consider increasing board size.");
  }

  return lines.join("\n");
}

/**
 * Check if total component footprint area can fit on the board,
 * and suggest a larger board if not.
 */
export function checkBoardCapacity(design: CircuitDesign): string | null {
  const board = design.board;
  if (!board || board.width <= 0 || board.height <= 0) return null;

  let totalFootprintArea = 0;
  for (const comp of design.components) {
    const fp = getFootprint(comp.package, comp.type);
    const totalW = fp.width + 2 * fp.keepout;
    const totalH = fp.height + 2 * fp.keepout;
    totalFootprintArea += totalW * totalH;
  }

  const boardArea = board.width * board.height;
  // If footprints use more than 60% of board area, placement becomes very difficult
  if (totalFootprintArea > boardArea * 0.6) {
    const neededArea = totalFootprintArea / 0.5; // target 50% utilization
    const aspectRatio = board.width / board.height;
    const suggestedH = Math.ceil(Math.sqrt(neededArea / aspectRatio));
    const suggestedW = Math.ceil(suggestedH * aspectRatio);
    return `Components require ~${Math.round(totalFootprintArea)}mm² of footprint area but the board is only ${boardArea}mm² (${board.width}x${board.height}mm). Consider increasing to at least ${suggestedW}x${suggestedH}mm.`;
  }

  return null;
}
```

**Step 2: Verify it compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add server/src/lib/validateDesign.ts
git commit -m "feat: add spatial map generation and board capacity check for validation feedback"
```

---

### Task 7: Integrate spatial map into the chat retry loop

**Files:**
- Modify: `server/src/routes/chat.ts:192-230` (validation retry loop)
- Modify: `server/src/routes/chat.ts:7` (imports)

**Step 1: Update imports**

Add `generateSpatialMap` and `checkBoardCapacity` to the import from validateDesign:

```typescript
import { validateDesign, formatValidationFeedback, generateSpatialMap, checkBoardCapacity } from "../lib/validateDesign.js";
```

**Step 2: Add spatial map and capacity check to retry feedback**

In the retry loop (around line 201-209), enhance the correction message to include the spatial map and board capacity suggestion:

```typescript
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
          // Build enhanced feedback with spatial context
          let enhancedFeedback = feedback;

          // Add spatial map so Claude can see the board layout
          const spatialMap = generateSpatialMap(design as CircuitDesign);
          if (spatialMap) {
            enhancedFeedback += `\n\n${spatialMap}`;
          }

          // Check if the board is too small for the components
          const capacityWarning = checkBoardCapacity(design as CircuitDesign);
          if (capacityWarning) {
            enhancedFeedback += `\n\nBOARD SIZE WARNING: ${capacityWarning}`;
          }

          const correctionMessages = [
            ...messages,
            { role: "assistant" as const, content: text },
            {
              role: "user" as const,
              content: `[SYSTEM — internal validation, not from the user. The user will NOT see this message.]\n\nYour design has validation issues. Fix them and output the corrected complete CircuitDesign JSON.\n\nIMPORTANT: Write your response as if it is your FIRST response to the user. Do NOT mention validation errors, corrections, or fixes. Do NOT say "you're right" or "let me fix" — the user never saw the broken version. Just give a friendly design explanation and the corrected JSON.\n\n${enhancedFeedback}`,
            },
          ];
```

This requires importing the `CircuitDesign` type. Add at the top of chat.ts or use type casting as shown.

Also need to add the `CircuitDesign` interface import. Since `validateDesign.ts` defines its own internal interfaces, and `chat.ts` only has the raw parsed JSON, cast `design as CircuitDesign` using a type import or inline type assertion. The simplest approach: add a type alias at the top of chat.ts:

```typescript
// Type alias for the design object shape used by spatial map functions
type CircuitDesign = Parameters<typeof generateSpatialMap>[0];
```

**Step 3: Update feedback on subsequent retries**

After the recheck on line 216, update the `feedback` variable for the next retry attempt if the design still has issues:

```typescript
          if (design) {
            const recheck = validateDesign(design);
            if (recheck.valid) {
              console.log(`[chat] Design corrected successfully on retry ${attempt + 1}`);
              break;
            }

            // Update feedback for next retry with fresh validation results
            feedback = formatValidationFeedback(recheck);

            if (attempt === MAX_RETRIES - 1) {
              console.log(`[chat] Design still has ${recheck.errors.length} errors after ${MAX_RETRIES} retries. Returning as-is.`);
            }
          }
```

**Step 4: Verify it compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add server/src/routes/chat.ts
git commit -m "feat: include spatial map and board capacity warnings in validation retry feedback"
```

---

### Task 8: End-to-end manual verification

**Step 1: Build and start the dev server**

Run: `npm run dev` (or whatever the dev command is)
Expected: Server starts without errors

**Step 2: Test with the DHT22 + OLED + buzzer design from the screenshot**

In the chat, send: "Design me a PCB with an Arduino Nano that reads temperature from a DHT22 sensor, displays it on an SSD1306 OLED screen, and sounds a piezo buzzer alarm when it gets too hot"

**Verify:**
- The AI's response mentions footprint sizes or shows awareness of component dimensions
- Components in the 3D view do NOT overlap
- The Arduino Nano, DHT22, OLED, and buzzer all have visible clearance between them
- The board is sized appropriately for all components

**Step 3: Test overlap detection**

If you can manually edit the design JSON to place two components at the same position, verify that validation catches it with a `FOOTPRINT_OVERLAP` error and the retry corrects it.

**Step 4: Test a simple design for regression**

Send: "Design me a PCB that turns on an LED using USB-C for power"

**Verify:**
- The MVP test case still works correctly
- No validation errors
- Components are well-placed and non-overlapping

---

## Summary of all files changed

| Task | File | Action |
|------|------|--------|
| 1 | `server/src/lib/componentLibrary.ts` | Add `Footprint` interface, add `footprint` to all components |
| 2 | `server/src/lib/footprintTable.ts` | **NEW** — package dimension lookup + geometry utils |
| 3 | `server/src/lib/validateDesign.ts` | Replace overlap check + board boundary check |
| 4 | `server/src/lib/componentLibrary.ts` | Update `formatLibraryForPrompt()` to show dimensions |
| 5 | `server/src/lib/buildPrompt.ts` | Rewrite placement rules with footprint-aware workflow |
| 6 | `server/src/lib/validateDesign.ts` | Add `generateSpatialMap()` + `checkBoardCapacity()` |
| 7 | `server/src/routes/chat.ts` | Wire spatial map into retry feedback loop |
| 8 | — | Manual end-to-end testing |