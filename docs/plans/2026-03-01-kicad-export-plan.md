# KiCad & Manufacturing Export Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Export DuckTape EDA designs to KiCad .kicad_pcb files, BOM CSV, and Pick & Place CSV for JLCPCB manufacturing.

**Architecture:** Client-side export pipeline. Three pure functions transform CircuitDesign JSON into downloadable files. A new pad geometry library maps package names to physical pad positions/shapes. All export runs in the browser — no server endpoints.

**Tech Stack:** TypeScript, KiCad 8 S-expression format, CSV generation, browser Blob downloads.

**Design doc:** `docs/plans/2026-03-01-kicad-export-design.md`

---

### Task 1: Add PadDef Type

**Files:**
- Modify: `src/types/circuit.ts`

**Step 1: Add PadDef interface to circuit.ts**

Add at the bottom of `src/types/circuit.ts`, before the `ChatMessage` interface:

```typescript
/** Physical pad definition for a component package */
export interface PadDef {
  /** Matches pin id from component ("1", "2", "anode", "VBUS", etc.) */
  id: string;
  /** X offset in mm relative to component center */
  x: number;
  /** Y offset in mm relative to component center */
  y: number;
  /** Pad shape */
  shape: "circle" | "rect" | "oval";
  /** Pad width in mm */
  width: number;
  /** Pad height in mm */
  height: number;
  /** Through-hole drill diameter in mm (omit for SMD pads) */
  drill?: number;
  /** Which side: "front" = F.Cu SMD, "back" = B.Cu SMD, "through" = all copper layers */
  layer: "front" | "back" | "through";
}
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds with no errors.

**Step 3: Commit**

```bash
git add src/types/circuit.ts
git commit -m "feat: add PadDef interface for pad geometry"
```

---

### Task 2: Create Pad Library

**Files:**
- Create: `src/lib/padLibrary.ts`

This file maps package names to pad geometry arrays. It covers all ~20 package types in the component library plus generator functions for parametric packages (DIP-N, PinHeader, JST).

**Step 1: Create src/lib/padLibrary.ts**

```typescript
import type { PadDef } from "../types/circuit";

// ── Generator functions for parametric packages ──

/** Generate pads for DIP-N packages (2 rows, 2.54mm pitch, 7.62mm row spacing) */
function dipPads(pinCount: number): PadDef[] {
  const half = pinCount / 2;
  const pads: PadDef[] = [];
  const yOffset = ((half - 1) * 2.54) / 2;

  // Left column: pins 1..half (top to bottom)
  for (let i = 0; i < half; i++) {
    pads.push({
      id: String(i + 1),
      x: -3.81,
      y: -yOffset + i * 2.54,
      shape: i === 0 ? "rect" : "circle",  // pin 1 is square
      width: 1.6,
      height: 1.6,
      drill: 0.8,
      layer: "through",
    });
  }

  // Right column: pins half+1..pinCount (bottom to top)
  for (let i = 0; i < half; i++) {
    pads.push({
      id: String(half + i + 1),
      x: 3.81,
      y: yOffset - i * 2.54,
      shape: "circle",
      width: 1.6,
      height: 1.6,
      drill: 0.8,
      layer: "through",
    });
  }

  return pads;
}

/** Generate pads for single-row pin headers (2.54mm pitch) */
function pinHeaderPads(pinCount: number): PadDef[] {
  const pads: PadDef[] = [];
  const yOffset = ((pinCount - 1) * 2.54) / 2;

  for (let i = 0; i < pinCount; i++) {
    pads.push({
      id: String(i + 1),
      x: 0,
      y: -yOffset + i * 2.54,
      shape: i === 0 ? "rect" : "circle",
      width: 1.7,
      height: 1.7,
      drill: 1.0,
      layer: "through",
    });
  }

  return pads;
}

/** Generate pads for JST PH connectors (2.0mm pitch) */
function jstPhPads(pinCount: number): PadDef[] {
  const pads: PadDef[] = [];
  const yOffset = ((pinCount - 1) * 2.0) / 2;

  for (let i = 0; i < pinCount; i++) {
    pads.push({
      id: String(i + 1),
      x: 0,
      y: -yOffset + i * 2.0,
      shape: i === 0 ? "rect" : "circle",
      width: 1.2,
      height: 1.2,
      drill: 0.7,
      layer: "through",
    });
  }

  return pads;
}

/** Generate pads for screw terminals (5.08mm pitch) */
function screwTerminalPads(pinCount: number): PadDef[] {
  const pads: PadDef[] = [];
  const yOffset = ((pinCount - 1) * 5.08) / 2;

  for (let i = 0; i < pinCount; i++) {
    pads.push({
      id: String(i + 1),
      x: 0,
      y: -yOffset + i * 5.08,
      shape: i === 0 ? "rect" : "circle",
      width: 2.5,
      height: 2.5,
      drill: 1.3,
      layer: "through",
    });
  }

  return pads;
}

/** Generate pads for dual-row pin header modules (dev boards like Arduino Nano, Pi Pico) */
function moduleDualRowPads(pinCount: number, rowSpacing: number): PadDef[] {
  const pinsPerSide = pinCount / 2;
  const pads: PadDef[] = [];
  const yOffset = ((pinsPerSide - 1) * 2.54) / 2;

  // Left row
  for (let i = 0; i < pinsPerSide; i++) {
    pads.push({
      id: String(i + 1),
      x: -rowSpacing / 2,
      y: -yOffset + i * 2.54,
      shape: i === 0 ? "rect" : "circle",
      width: 1.7,
      height: 1.7,
      drill: 1.0,
      layer: "through",
    });
  }

  // Right row
  for (let i = 0; i < pinsPerSide; i++) {
    pads.push({
      id: String(pinsPerSide + i + 1),
      x: rowSpacing / 2,
      y: -yOffset + i * 2.54,
      shape: "circle",
      width: 1.7,
      height: 1.7,
      drill: 1.0,
      layer: "through",
    });
  }

  return pads;
}

// ── Static pad definitions by package name ──

const PACKAGE_PADS: Record<string, PadDef[]> = {
  // Through-hole passives (axial, 10.16mm lead spacing)
  "Axial_TH": [
    { id: "1", x: -5.08, y: 0, shape: "rect", width: 1.6, height: 1.6, drill: 0.8, layer: "through" },
    { id: "2", x: 5.08, y: 0, shape: "circle", width: 1.6, height: 1.6, drill: 0.8, layer: "through" },
  ],

  // Through-hole capacitor (radial, 2.5mm lead spacing)
  "Radial_TH": [
    { id: "1", x: -1.25, y: 0, shape: "rect", width: 1.6, height: 1.6, drill: 0.8, layer: "through" },
    { id: "2", x: 1.25, y: 0, shape: "circle", width: 1.6, height: 1.6, drill: 0.8, layer: "through" },
  ],

  // Signal diode (DO-35, 7.62mm lead spacing)
  "DO-35_TH": [
    { id: "1", x: -3.81, y: 0, shape: "rect", width: 1.6, height: 1.6, drill: 0.8, layer: "through" },
    { id: "2", x: 3.81, y: 0, shape: "circle", width: 1.6, height: 1.6, drill: 0.8, layer: "through" },
  ],

  // Rectifier diode (DO-41, 10.16mm lead spacing)
  "DO-41_TH": [
    { id: "1", x: -5.08, y: 0, shape: "rect", width: 1.8, height: 1.8, drill: 1.0, layer: "through" },
    { id: "2", x: 5.08, y: 0, shape: "circle", width: 1.8, height: 1.8, drill: 1.0, layer: "through" },
  ],

  // 5mm through-hole LED (2.54mm lead spacing)
  "5mm_TH": [
    { id: "1", x: -1.27, y: 0, shape: "rect", width: 1.8, height: 1.8, drill: 0.9, layer: "through" },
    { id: "2", x: 1.27, y: 0, shape: "circle", width: 1.8, height: 1.8, drill: 0.9, layer: "through" },
  ],

  // 3mm through-hole LED (2.54mm lead spacing)
  "3mm_TH": [
    { id: "1", x: -1.27, y: 0, shape: "rect", width: 1.6, height: 1.6, drill: 0.8, layer: "through" },
    { id: "2", x: 1.27, y: 0, shape: "circle", width: 1.6, height: 1.6, drill: 0.8, layer: "through" },
  ],

  // SMD 0805 (2-pad, 1.9mm center-to-center)
  "0805": [
    { id: "1", x: -0.95, y: 0, shape: "rect", width: 1.0, height: 1.3, layer: "front" },
    { id: "2", x: 0.95, y: 0, shape: "rect", width: 1.0, height: 1.3, layer: "front" },
  ],

  // SMD 0603
  "0603": [
    { id: "1", x: -0.8, y: 0, shape: "rect", width: 0.8, height: 0.9, layer: "front" },
    { id: "2", x: 0.8, y: 0, shape: "rect", width: 0.8, height: 0.9, layer: "front" },
  ],

  // SMD 1206
  "1206": [
    { id: "1", x: -1.5, y: 0, shape: "rect", width: 1.1, height: 1.8, layer: "front" },
    { id: "2", x: 1.5, y: 0, shape: "rect", width: 1.1, height: 1.8, layer: "front" },
  ],

  // SMD diode (SMB package)
  "SMB": [
    { id: "1", x: -2.0, y: 0, shape: "rect", width: 1.6, height: 2.2, layer: "front" },
    { id: "2", x: 2.0, y: 0, shape: "rect", width: 1.6, height: 2.2, layer: "front" },
  ],

  // WS2812B addressable LED (5050 package, 4 pads)
  "LED_SMD_5050": [
    { id: "1", x: -2.45, y: -1.6, shape: "rect", width: 1.5, height: 1.0, layer: "front" },  // VDD
    { id: "2", x: 2.45, y: -1.6, shape: "rect", width: 1.5, height: 1.0, layer: "front" },   // DOUT
    { id: "3", x: 2.45, y: 1.6, shape: "rect", width: 1.5, height: 1.0, layer: "front" },    // VSS
    { id: "4", x: -2.45, y: 1.6, shape: "rect", width: 1.5, height: 1.0, layer: "front" },   // DIN
  ],

  // USB-C receptacle (simplified 4-pin model)
  "USB_C_Receptacle": [
    { id: "VBUS", x: -1.75, y: -3.0, shape: "rect", width: 0.6, height: 1.2, layer: "front" },
    { id: "GND",  x: 1.75,  y: -3.0, shape: "rect", width: 0.6, height: 1.2, layer: "front" },
    { id: "CC1",  x: -0.5,  y: -3.0, shape: "rect", width: 0.3, height: 1.0, layer: "front" },
    { id: "CC2",  x: 0.5,   y: -3.0, shape: "rect", width: 0.3, height: 1.0, layer: "front" },
  ],

  // DC barrel jack (3-pin: tip, sleeve, switch)
  "BarrelJack_TH": [
    { id: "1", x: 0,    y: -4.7, shape: "circle", width: 2.4, height: 2.4, drill: 1.2, layer: "through" },
    { id: "2", x: -3.0, y: 0,    shape: "circle", width: 2.4, height: 2.4, drill: 1.2, layer: "through" },
    { id: "3", x: 3.0,  y: 0,    shape: "circle", width: 2.4, height: 2.4, drill: 1.2, layer: "through" },
  ],

  // SOT-223 voltage regulator (3 pins + tab)
  "SOT-223": [
    { id: "1", x: -2.3, y: 3.15, shape: "rect", width: 0.95, height: 1.5, layer: "front" },
    { id: "2", x: 0,    y: 3.15, shape: "rect", width: 0.95, height: 1.5, layer: "front" },
    { id: "3", x: 2.3,  y: 3.15, shape: "rect", width: 0.95, height: 1.5, layer: "front" },
  ],

  // SOT-23 (3-pin SMD transistor/MOSFET)
  "SOT-23": [
    { id: "1", x: -0.95, y: 1.1, shape: "rect", width: 0.6, height: 0.7, layer: "front" },
    { id: "2", x: 0.95,  y: 1.1, shape: "rect", width: 0.6, height: 0.7, layer: "front" },
    { id: "3", x: 0,     y: -1.1, shape: "rect", width: 0.6, height: 0.7, layer: "front" },
  ],

  // TO-220 (3-pin through-hole regulator/MOSFET)
  "TO-220_TH": [
    { id: "1", x: -2.54, y: 0, shape: "rect", width: 1.8, height: 1.8, drill: 1.0, layer: "through" },
    { id: "2", x: 0,     y: 0, shape: "circle", width: 1.8, height: 1.8, drill: 1.0, layer: "through" },
    { id: "3", x: 2.54,  y: 0, shape: "circle", width: 1.8, height: 1.8, drill: 1.0, layer: "through" },
  ],

  // TO-92 (3-pin through-hole transistor)
  "TO-92_TH": [
    { id: "1", x: -1.27, y: 0, shape: "rect", width: 1.4, height: 1.4, drill: 0.75, layer: "through" },
    { id: "2", x: 0,     y: 0, shape: "circle", width: 1.4, height: 1.4, drill: 0.75, layer: "through" },
    { id: "3", x: 1.27,  y: 0, shape: "circle", width: 1.4, height: 1.4, drill: 0.75, layer: "through" },
  ],

  // Tactile push button (6mm, 4 pins)
  "SW_Push_6mm_TH": [
    { id: "A1", x: -3.25, y: -2.25, shape: "circle", width: 1.6, height: 1.6, drill: 0.9, layer: "through" },
    { id: "A2", x: 3.25,  y: -2.25, shape: "circle", width: 1.6, height: 1.6, drill: 0.9, layer: "through" },
    { id: "B1", x: -3.25, y: 2.25,  shape: "circle", width: 1.6, height: 1.6, drill: 0.9, layer: "through" },
    { id: "B2", x: 3.25,  y: 2.25,  shape: "circle", width: 1.6, height: 1.6, drill: 0.9, layer: "through" },
  ],

  // Slide switch (SPDT, 3 pins)
  "SW_Slide_SPDT_TH": [
    { id: "A",      x: -2.54, y: 0, shape: "circle", width: 1.6, height: 1.6, drill: 0.9, layer: "through" },
    { id: "Common", x: 0,     y: 0, shape: "rect", width: 1.6, height: 1.6, drill: 0.9, layer: "through" },
    { id: "B",      x: 2.54,  y: 0, shape: "circle", width: 1.6, height: 1.6, drill: 0.9, layer: "through" },
  ],

  // Potentiometer (3 pins)
  "Potentiometer_TH": [
    { id: "1", x: -2.5, y: 5.0, shape: "circle", width: 1.6, height: 1.6, drill: 0.9, layer: "through" },
    { id: "2", x: 0,    y: 5.0, shape: "rect", width: 1.6, height: 1.6, drill: 0.9, layer: "through" },
    { id: "3", x: 2.5,  y: 5.0, shape: "circle", width: 1.6, height: 1.6, drill: 0.9, layer: "through" },
  ],

  // Buzzer (2-pin, 12mm)
  "Buzzer_12mm_TH": [
    { id: "1", x: -3.25, y: 0, shape: "rect", width: 1.6, height: 1.6, drill: 0.8, layer: "through" },
    { id: "2", x: 3.25,  y: 0, shape: "circle", width: 1.6, height: 1.6, drill: 0.8, layer: "through" },
  ],

  // Crystal oscillator (HC49, 2 pins)
  "HC49_TH": [
    { id: "1", x: -2.44, y: 0, shape: "circle", width: 1.6, height: 1.6, drill: 0.8, layer: "through" },
    { id: "2", x: 2.44,  y: 0, shape: "circle", width: 1.6, height: 1.6, drill: 0.8, layer: "through" },
  ],

  // SIP-4 sensor module (DHT22 etc., 2.54mm pitch)
  "SIP-4_TH": pinHeaderPads(4),

  // LDR photoresistor (5mm, 5.08mm lead spacing)
  "LDR_TH": [
    { id: "1", x: -2.54, y: 0, shape: "circle", width: 1.6, height: 1.6, drill: 0.8, layer: "through" },
    { id: "2", x: 2.54,  y: 0, shape: "circle", width: 1.6, height: 1.6, drill: 0.8, layer: "through" },
  ],

  // Battery holders
  "BatteryHolder_2xAA": [
    { id: "1", x: -14.0, y: 0, shape: "rect", width: 2.5, height: 2.5, drill: 1.3, layer: "through" },
    { id: "2", x: 14.0,  y: 0, shape: "circle", width: 2.5, height: 2.5, drill: 1.3, layer: "through" },
  ],
  "BatteryHolder_18650": [
    { id: "1", x: -18.0, y: 0, shape: "rect", width: 2.5, height: 2.5, drill: 1.3, layer: "through" },
    { id: "2", x: 18.0,  y: 0, shape: "circle", width: 2.5, height: 2.5, drill: 1.3, layer: "through" },
  ],

  // DIP ICs
  "DIP-8": dipPads(8),
  "DIP-16": dipPads(16),
  "DIP-28": dipPads(28),

  // Pin headers
  "PinHeader_1x2_P2.54mm": pinHeaderPads(2),
  "PinHeader_1x4_P2.54mm": pinHeaderPads(4),
  "PinHeader_1x6_P2.54mm": pinHeaderPads(6),

  // JST PH connectors
  "JST_PH_S3B-PH-K_1x3_P2.00mm": jstPhPads(3),
  "JST_PH_S4B-PH-K_1x4_P2.00mm": jstPhPads(4),

  // Screw terminals
  "ScrewTerminal_1x2_P5.08mm": screwTerminalPads(2),

  // Module packages (dual-row pin headers representing dev boards)
  // Row spacing varies by module width
  "Module_DIP":        moduleDualRowPads(40, 22.86),   // ESP32-style wide module
  "Module_DIP_40pin":  moduleDualRowPads(40, 17.78),   // Pi Pico
  "Module_DIP_30pin":  moduleDualRowPads(30, 15.24),   // Arduino Nano
  "Module_4pin":       pinHeaderPads(4),                // Simple 4-pin modules (I2C sensors)
  "Module_3pin":       pinHeaderPads(3),                // Simple 3-pin modules
  "Module_6pin":       pinHeaderPads(6),                // 6-pin modules
  "Module_8pin":       pinHeaderPads(8),                // 8-pin modules
  "Module_10pin":      pinHeaderPads(10),               // 10-pin modules
  "Module_16pin":      pinHeaderPads(16),               // 16-pin modules (LCD I2C)
};

/**
 * Look up pad definitions for a package.
 * Falls back to dynamically generated pads based on pin count if package not found.
 */
export function getPads(packageName: string, pinCount: number): PadDef[] {
  // Exact match
  if (PACKAGE_PADS[packageName]) {
    return PACKAGE_PADS[packageName];
  }

  // Dynamic PinHeader match (e.g. "PinHeader_1x8_P2.54mm")
  const headerMatch = packageName.match(/^PinHeader_1x(\d+)/);
  if (headerMatch) {
    return pinHeaderPads(parseInt(headerMatch[1], 10));
  }

  // Dynamic JST match (e.g. "JST_PH_S5B-PH-K_1x5_P2.00mm")
  const jstMatch = packageName.match(/^JST_PH.*?(\d+).*?P2\.00mm/);
  if (jstMatch) {
    return jstPhPads(parseInt(jstMatch[1], 10));
  }

  // Dynamic ScrewTerminal match
  const screwMatch = packageName.match(/^ScrewTerminal_1x(\d+)/);
  if (screwMatch) {
    return screwTerminalPads(parseInt(screwMatch[1], 10));
  }

  // Dynamic DIP match
  const dipMatch = packageName.match(/^DIP-(\d+)/);
  if (dipMatch) {
    return dipPads(parseInt(dipMatch[1], 10));
  }

  // Fallback: evenly spaced single-row pads along Y axis
  return pinHeaderPads(pinCount);
}
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add src/lib/padLibrary.ts
git commit -m "feat: add pad geometry library for all component packages"
```

---

### Task 3: BOM CSV Export

**Files:**
- Create: `src/lib/exportBom.ts`

**Step 1: Create src/lib/exportBom.ts**

```typescript
import type { CircuitDesign } from "../types/circuit";

/**
 * Generate JLCPCB-format BOM CSV from a CircuitDesign.
 * Columns: Comment, Designator, Footprint, LCSC Part #
 */
export function generateBomCsv(design: CircuitDesign): string {
  const lines: string[] = [
    "Comment,Designator,Footprint,LCSC Part #",
  ];

  // Group components by value + package (same part = one BOM row)
  const groups = new Map<string, { value: string; package: string; partNumber: string; refs: string[] }>();

  for (const comp of design.components) {
    const key = `${comp.value}||${comp.package}`;
    const existing = groups.get(key);
    if (existing) {
      existing.refs.push(comp.ref);
    } else {
      groups.set(key, {
        value: comp.value,
        package: comp.package,
        partNumber: comp.partNumber ?? "",
        refs: [comp.ref],
      });
    }
  }

  for (const group of groups.values()) {
    const comment = csvEscape(group.value);
    const designators = csvEscape(group.refs.sort().join(", "));
    const footprint = csvEscape(group.package);
    const partNum = csvEscape(group.partNumber);
    lines.push(`${comment},${designators},${footprint},${partNum}`);
  }

  return lines.join("\n");
}

/** Escape a CSV field: wrap in quotes if it contains commas, quotes, or newlines */
function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Trigger a file download in the browser */
export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add src/lib/exportBom.ts
git commit -m "feat: add BOM CSV export with JLCPCB format"
```

---

### Task 4: Pick & Place CSV Export

**Files:**
- Create: `src/lib/exportCpl.ts`

**Step 1: Create src/lib/exportCpl.ts**

```typescript
import type { CircuitDesign } from "../types/circuit";

/**
 * Generate JLCPCB-format Pick & Place (CPL) CSV from a CircuitDesign.
 * Columns: Designator, Mid X, Mid Y, Rotation, Layer
 */
export function generateCplCsv(design: CircuitDesign): string {
  const lines: string[] = [
    "Designator,Mid X,Mid Y,Rotation,Layer",
  ];

  for (const comp of design.components) {
    const designator = comp.ref;
    const midX = comp.pcbPosition.x.toFixed(2);
    const midY = comp.pcbPosition.y.toFixed(2);
    const rotation = comp.pcbPosition.rotation.toFixed(0);
    const layer = "Top";  // All components on front side for now
    lines.push(`${designator},${midX},${midY},${rotation},${layer}`);
  }

  return lines.join("\n");
}
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add src/lib/exportCpl.ts
git commit -m "feat: add Pick & Place CSV export with JLCPCB format"
```

---

### Task 5: KiCad .kicad_pcb Export

This is the largest task. The generator produces a valid KiCad 8 S-expression file.

**Files:**
- Create: `src/lib/exportKicad.ts`

**Step 1: Create src/lib/exportKicad.ts**

```typescript
import type { CircuitDesign, Component, PadDef } from "../types/circuit";
import { getPads } from "./padLibrary";

/** Generate a random UUID v4 */
function uuid(): string {
  return crypto.randomUUID();
}

/** Format a number to 4 decimal places (KiCad convention) */
function n(value: number): string {
  return value.toFixed(4);
}

// ── KiCad 8 layer definitions for 2-layer board ──

const LAYERS_BLOCK = `  (layers
    (0 "F.Cu" signal)
    (31 "B.Cu" signal)
    (32 "B.Adhes" user "B.Adhesive")
    (33 "F.Adhes" user "F.Adhesive")
    (34 "B.Paste" user)
    (35 "F.Paste" user)
    (36 "B.SilkS" user "B.Silkscreen")
    (37 "F.SilkS" user "F.Silkscreen")
    (38 "B.Mask" user "B.Mask")
    (39 "F.Mask" user "F.Mask")
    (40 "Dwgs.User" user "User.Drawings")
    (41 "Cmts.User" user "User.Comments")
    (42 "Eco1.User" user "User.Eco1")
    (43 "Eco2.User" user "User.Eco2")
    (44 "Edge.Cuts" user)
    (45 "Margin" user)
    (46 "B.CrtYd" user "B.Courtyard")
    (47 "F.CrtYd" user "F.Courtyard")
    (48 "B.Fab" user "B.Fab")
    (49 "F.Fab" user "F.Fab")
  )`;

const SETUP_BLOCK = `  (setup
    (pad_to_mask_clearance 0)
    (pcbplotparams
      (layerselection 0x00010fc_ffffffff)
      (plot_on_all_layers_selection 0x0000000_00000000)
      (disableapertmacros false)
      (usegerberextensions false)
      (usegerberattributes true)
      (usegerberadvancedattributes true)
      (creategerberjobfile true)
      (dashed_line_dash_ratio 12.000000)
      (dashed_line_gap_ratio 3.000000)
      (svgprecision 4)
      (plotframeref false)
      (viasonmask false)
      (mode 1)
      (useauxorigin false)
      (hpglpennumber 1)
      (hpglpenspeed 20)
      (hpglpendiameter 15.000000)
      (dxfpolygonmode true)
      (dxfimperialunits true)
      (dxfusepcbnewfont true)
      (psnegative false)
      (psa4output false)
      (plotreference true)
      (plotvalue true)
      (plotinvisibletext false)
      (sketchpadsonfab false)
      (subtractmaskfromsilk false)
      (outputformat 1)
      (mirror false)
      (drillshape 1)
      (scaleselection 1)
      (outputdirectory "")
    )
  )`;

/**
 * Build the net-to-pad mapping: for each component pin, which net does it belong to?
 * Returns: Map<"R1.1", netOrdinal>
 */
function buildNetMap(design: CircuitDesign): {
  netNames: string[];            // index = ordinal (0 = unconnected)
  pinToNet: Map<string, number>; // "R1.1" → net ordinal
} {
  const netNames = [""];  // net 0 = unconnected
  const pinToNet = new Map<string, number>();

  for (const conn of design.connections) {
    const ordinal = netNames.length;
    netNames.push(conn.netName);
    for (const pin of conn.pins) {
      pinToNet.set(`${pin.ref}.${pin.pin}`, ordinal);
    }
  }

  return { netNames, pinToNet };
}

/** Generate the pad layers string for KiCad */
function padLayers(pad: PadDef): string {
  if (pad.layer === "through") {
    return '"*.Cu" "*.Mask"';
  } else if (pad.layer === "front") {
    return '"F.Cu" "F.Paste" "F.Mask"';
  } else {
    return '"B.Cu" "B.Paste" "B.Mask"';
  }
}

/** Generate the pad type string */
function padType(pad: PadDef): string {
  return pad.drill ? "thru_hole" : "smd";
}

/** Generate a single pad S-expression */
function renderPad(
  pad: PadDef,
  netOrdinal: number,
  netName: string,
): string {
  const drillStr = pad.drill ? `\n      (drill ${n(pad.drill)})` : "";
  const netStr = netOrdinal > 0
    ? `\n      (net ${netOrdinal} "${netName}")`
    : "";

  return `    (pad "${pad.id}" ${padType(pad)} ${pad.shape}
      (at ${n(pad.x)} ${n(pad.y)})
      (size ${n(pad.width)} ${n(pad.height)})${drillStr}
      (layers ${padLayers(pad)})${netStr}
      (uuid "${uuid()}")
    )`;
}

/** Generate a footprint block for one component */
function renderFootprint(
  comp: Component,
  pads: PadDef[],
  netNames: string[],
  pinToNet: Map<string, number>,
): string {
  const x = n(comp.pcbPosition.x);
  const y = n(comp.pcbPosition.y);
  const rot = comp.pcbPosition.rotation !== 0 ? ` ${n(comp.pcbPosition.rotation)}` : "";

  // Generate pad blocks
  const padBlocks = pads.map((pad) => {
    const key = `${comp.ref}.${pad.id}`;
    const netOrd = pinToNet.get(key) ?? 0;
    const netName = netNames[netOrd] ?? "";
    return renderPad(pad, netOrd, netName);
  }).join("\n");

  return `  (footprint "DuckTapeEDA:${comp.package}"
    (layer "F.Cu")
    (uuid "${uuid()}")
    (at ${x} ${y}${rot})

    (fp_text reference "${comp.ref}"
      (at 0 -3)
      (layer "F.SilkS")
      (uuid "${uuid()}")
      (effects (font (size 1 1) (thickness 0.15)))
    )
    (fp_text value "${comp.value}"
      (at 0 3)
      (layer "F.Fab")
      (uuid "${uuid()}")
      (effects (font (size 1 1) (thickness 0.15)))
    )

${padBlocks}
  )`;
}

/** Generate the board outline on Edge.Cuts layer */
function renderBoardOutline(design: CircuitDesign): string {
  const w = design.board.width;
  const h = design.board.height;
  const r = design.board.cornerRadius;

  if (r <= 0) {
    // Simple rectangle
    return `  (gr_rect
    (start 0 0) (end ${n(w)} ${n(h)})
    (stroke (width 0.05) (type solid))
    (fill none)
    (layer "Edge.Cuts")
    (uuid "${uuid()}")
  )`;
  }

  // Rounded rectangle: 4 lines + 4 arcs
  // Corner arcs use 3-point form: (start) (mid) (end) where mid is on the arc
  const cr = Math.min(r, w / 2, h / 2);  // clamp radius
  const lines: string[] = [];

  // Precompute the arc midpoint offset (45 degrees on the corner radius)
  const m = cr * (1 - Math.cos(Math.PI / 4));  // ~0.293 * cr

  // Top edge
  lines.push(`  (gr_line (start ${n(cr)} 0) (end ${n(w - cr)} 0) (stroke (width 0.05) (type solid)) (layer "Edge.Cuts") (uuid "${uuid()}"))`);
  // Top-right arc
  lines.push(`  (gr_arc (start ${n(w - cr)} 0) (mid ${n(w - m)} ${n(m)}) (end ${n(w)} ${n(cr)}) (stroke (width 0.05) (type solid)) (layer "Edge.Cuts") (uuid "${uuid()}"))`);
  // Right edge
  lines.push(`  (gr_line (start ${n(w)} ${n(cr)}) (end ${n(w)} ${n(h - cr)}) (stroke (width 0.05) (type solid)) (layer "Edge.Cuts") (uuid "${uuid()}"))`);
  // Bottom-right arc
  lines.push(`  (gr_arc (start ${n(w)} ${n(h - cr)}) (mid ${n(w - m)} ${n(h - m)}) (end ${n(w - cr)} ${n(h)}) (stroke (width 0.05) (type solid)) (layer "Edge.Cuts") (uuid "${uuid()}"))`);
  // Bottom edge
  lines.push(`  (gr_line (start ${n(w - cr)} ${n(h)}) (end ${n(cr)} ${n(h)}) (stroke (width 0.05) (type solid)) (layer "Edge.Cuts") (uuid "${uuid()}"))`);
  // Bottom-left arc
  lines.push(`  (gr_arc (start ${n(cr)} ${n(h)}) (mid ${n(m)} ${n(h - m)}) (end 0 ${n(h - cr)}) (stroke (width 0.05) (type solid)) (layer "Edge.Cuts") (uuid "${uuid()}"))`);
  // Left edge
  lines.push(`  (gr_line (start 0 ${n(h - cr)}) (end 0 ${n(cr)}) (stroke (width 0.05) (type solid)) (layer "Edge.Cuts") (uuid "${uuid()}"))`);
  // Top-left arc
  lines.push(`  (gr_arc (start 0 ${n(cr)}) (mid ${n(m)} ${n(m)}) (end ${n(cr)} 0) (stroke (width 0.05) (type solid)) (layer "Edge.Cuts") (uuid "${uuid()}"))`);

  return lines.join("\n");
}

/** Generate silkscreen branding text */
function renderBranding(design: CircuitDesign): string {
  if (!design.branding) return "";

  const b = design.branding;
  const layer = b.layer === "front" ? "F.SilkS" : "B.SilkS";
  const mirror = b.layer === "back" ? " mirror" : "";
  const fontSize = 1.5 * b.scale;
  const smallFontSize = 1.0 * b.scale;
  const lines: string[] = [];

  // Board name
  lines.push(`  (gr_text "${b.name}"
    (at ${n(b.position.x)} ${n(b.position.y)})
    (layer "${layer}")
    (uuid "${uuid()}")
    (effects (font (size ${n(fontSize)} ${n(fontSize)}) (thickness ${n(0.2 * b.scale)})) (justify left${mirror}))
  )`);

  // Version string below name
  lines.push(`  (gr_text "${b.version}"
    (at ${n(b.position.x)} ${n(b.position.y + fontSize * 1.5)})
    (layer "${layer}")
    (uuid "${uuid()}")
    (effects (font (size ${n(smallFontSize)} ${n(smallFontSize)}) (thickness ${n(0.15 * b.scale)})) (justify left${mirror}))
  )`);

  return lines.join("\n");
}

/**
 * Generate a complete KiCad 8 .kicad_pcb file from a CircuitDesign.
 */
export function generateKicadPcb(design: CircuitDesign): string {
  const { netNames, pinToNet } = buildNetMap(design);

  // Net declarations
  const netDecls = netNames.map((name, i) =>
    `  (net ${i} "${name}")`
  ).join("\n");

  // Footprint blocks
  const footprints = design.components.map((comp) => {
    const pads = getPads(comp.package, comp.pins.length);
    return renderFootprint(comp, pads, netNames, pinToNet);
  }).join("\n\n");

  // Board outline
  const outline = renderBoardOutline(design);

  // Branding
  const branding = renderBranding(design);

  // Board title on front silkscreen
  const titleText = design.name
    ? `  (gr_text "${design.name}"
    (at ${n(design.board.width / 2)} ${n(-2)})
    (layer "F.SilkS")
    (uuid "${uuid()}")
    (effects (font (size 1.5 1.5) (thickness 0.2)))
  )`
    : "";

  return `(kicad_pcb
  (version 20240108)
  (generator "DuckTapeEDA")
  (generator_version "1.0")

  (general (thickness 1.6))
  (paper "A4")

${LAYERS_BLOCK}

${SETUP_BLOCK}

${netDecls}

${outline}

${titleText}

${branding}

${footprints}
)
`;
}
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add src/lib/exportKicad.ts
git commit -m "feat: add KiCad .kicad_pcb export generator"
```

---

### Task 6: Wire Up Export Buttons in UI

**Files:**
- Modify: `src/components/DesignViewer.tsx`

**Step 1: Add imports and export handlers**

At the top of `DesignViewer.tsx`, add imports:

```typescript
import { generateBomCsv, downloadFile } from "../lib/exportBom";
import { generateCplCsv } from "../lib/exportCpl";
import { generateKicadPcb } from "../lib/exportKicad";
```

Inside the component function, before the `return`, add state and handlers:

```typescript
  const [showBomMenu, setShowBomMenu] = useState(false);

  const handleExportKicad = () => {
    if (!design) return;
    const pcbContent = generateKicadPcb(design);
    const filename = `${design.name.replace(/[^a-zA-Z0-9_-]/g, "_") || "board"}.kicad_pcb`;
    downloadFile(pcbContent, filename, "application/octet-stream");
  };

  const handleExportBom = () => {
    if (!design) return;
    const csvContent = generateBomCsv(design);
    const filename = `${design.name.replace(/[^a-zA-Z0-9_-]/g, "_") || "board"}_BOM.csv`;
    downloadFile(csvContent, filename, "text/csv");
    setShowBomMenu(false);
  };

  const handleExportCpl = () => {
    if (!design) return;
    const csvContent = generateCplCsv(design);
    const filename = `${design.name.replace(/[^a-zA-Z0-9_-]/g, "_") || "board"}_CPL.csv`;
    downloadFile(csvContent, filename, "text/csv");
    setShowBomMenu(false);
  };
```

**Step 2: Replace the disabled buttons**

Replace the two disabled placeholder buttons with working versions. Find this block:

```typescript
            <button
              disabled
              className="text-xs px-3 py-1.5 border border-gray-300 rounded text-gray-400 cursor-not-allowed"
            >
              Download KiCad
            </button>
            <button
              disabled
              className="text-xs px-3 py-1.5 border border-gray-300 rounded text-gray-400 cursor-not-allowed"
            >
              BOM
            </button>
```

Replace with:

```typescript
            <button
              onClick={handleExportKicad}
              className="text-xs px-3 py-1.5 border border-gray-300 rounded text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Download KiCad
            </button>
            <div className="relative">
              <button
                onClick={() => setShowBomMenu(!showBomMenu)}
                className="text-xs px-3 py-1.5 border border-gray-300 rounded text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Export &#9662;
              </button>
              {showBomMenu && (
                <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded shadow-lg z-50 min-w-[140px]">
                  <button
                    onClick={handleExportBom}
                    className="block w-full text-left text-xs px-3 py-2 hover:bg-gray-50 text-gray-700"
                  >
                    BOM CSV
                  </button>
                  <button
                    onClick={handleExportCpl}
                    className="block w-full text-left text-xs px-3 py-2 hover:bg-gray-50 text-gray-700"
                  >
                    Pick &amp; Place CSV
                  </button>
                </div>
              )}
            </div>
```

**Step 3: Add click-outside handler to close dropdown**

Add a useEffect to close the dropdown when clicking outside. Add `useEffect` and `useRef` to the React import at the top:

```typescript
import { useState, useEffect, useRef } from "react";
```

Inside the component, add:

```typescript
  const bomMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showBomMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (bomMenuRef.current && !bomMenuRef.current.contains(e.target as Node)) {
        setShowBomMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showBomMenu]);
```

And wrap the dropdown `<div className="relative">` with `ref={bomMenuRef}`.

**Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds.

**Step 5: Commit**

```bash
git add src/components/DesignViewer.tsx
git commit -m "feat: wire up KiCad, BOM, and Pick & Place export buttons"
```

---

### Task 7: End-to-End Verification

**Step 1: Start dev server**

Run: `npm run dev`

**Step 2: Generate a test design**

Use the chat to generate a design: "Design me a small PCB with a JST connector and a WS2812B LED"

**Step 3: Test KiCad export**

Click "Download KiCad". Verify:
- A `.kicad_pcb` file downloads
- Open in a text editor — confirm it has valid S-expression syntax
- Confirm it contains: version header, layer definitions, net declarations, footprints with pads, board outline on Edge.Cuts
- If KiCad 8 is installed: open the file in KiCad and verify components appear at correct positions with nets assigned

**Step 4: Test BOM export**

Click "Export" → "BOM CSV". Verify:
- A CSV file downloads
- Open in a text editor — confirm header row: `Comment,Designator,Footprint,LCSC Part #`
- Confirm all components appear grouped by value+package
- Confirm identical parts are grouped (e.g., two 100nF caps on one row)

**Step 5: Test Pick & Place export**

Click "Export" → "Pick & Place CSV". Verify:
- A CSV file downloads
- Open in a text editor — confirm header row: `Designator,Mid X,Mid Y,Rotation,Layer`
- Confirm positions match the PCB layout editor positions
- Confirm all components listed

**Step 6: Test with stress-test design**

Generate: "Design me a PCB with an Arduino Nano, a 16x2 LCD display, a DHT22 temperature sensor, and an HC-SR04 ultrasonic sensor, powered by USB-C"

Export all three files. Verify KiCad file has correct footprints for all components including the large module packages (Arduino Nano = Module_DIP_30pin, LCD = Module_16pin, etc.).

**Step 7: Commit any fixes found during testing**

```bash
git add -A
git commit -m "fix: address issues found during export end-to-end testing"
```
