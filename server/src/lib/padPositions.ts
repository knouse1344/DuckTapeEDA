/**
 * Pad Position Computation for AI Trace Routing
 *
 * Computes absolute pad positions for all components in a design.
 * Used by:
 *   - buildPrompt.ts: inject pad positions into AI routing prompt
 *   - validateDesign.ts: verify traces connect to correct pad locations
 *
 * NOTE: Pad geometry data is duplicated from src/lib/padLibrary.ts because
 * the server cannot import from the client's src/ directory.
 */

// ── Types ──

/** Physical pad definition for a component package */
interface PadDef {
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

/** Minimal component shape needed for pad position computation */
interface DesignComponent {
  ref: string;
  package: string;
  pins: { id: string; name: string; type: string }[];
  pcbPosition: { x: number; y: number; rotation: number };
}

/** Absolute pad position on the board */
export interface AbsolutePadPosition {
  ref: string;
  pinId: string;
  x: number;
  y: number;
}

// ── Generator functions for parametric packages ──

/** Generate pads for DIP-N packages (2 rows, 2.54mm pitch, 7.62mm row spacing) */
function dipPads(pinCount: number): PadDef[] {
  const half = pinCount / 2;
  const pads: PadDef[] = [];
  const yOffset = ((half - 1) * 2.54) / 2;

  for (let i = 0; i < half; i++) {
    pads.push({
      id: String(i + 1),
      x: -3.81,
      y: -yOffset + i * 2.54,
      shape: i === 0 ? "rect" : "circle",
      width: 1.6,
      height: 1.6,
      drill: 0.8,
      layer: "through",
    });
  }

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

/** Generate pads for dual-row pin header modules (dev boards) */
function moduleDualRowPads(pinCount: number, rowSpacing: number): PadDef[] {
  const pinsPerSide = pinCount / 2;
  const pads: PadDef[] = [];
  const yOffset = ((pinsPerSide - 1) * 2.54) / 2;

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
  "Axial_TH": [
    { id: "1", x: -5.08, y: 0, shape: "rect", width: 1.6, height: 1.6, drill: 0.8, layer: "through" },
    { id: "2", x: 5.08, y: 0, shape: "circle", width: 1.6, height: 1.6, drill: 0.8, layer: "through" },
  ],

  "Radial_TH": [
    { id: "1", x: -1.25, y: 0, shape: "rect", width: 1.6, height: 1.6, drill: 0.8, layer: "through" },
    { id: "2", x: 1.25, y: 0, shape: "circle", width: 1.6, height: 1.6, drill: 0.8, layer: "through" },
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
    { id: "1", x: -1.27, y: 0, shape: "rect", width: 1.8, height: 1.8, drill: 0.9, layer: "through" },
    { id: "2", x: 1.27, y: 0, shape: "circle", width: 1.8, height: 1.8, drill: 0.9, layer: "through" },
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
    { id: "1", x: -1.5, y: 0, shape: "rect", width: 1.1, height: 1.8, layer: "front" },
    { id: "2", x: 1.5, y: 0, shape: "rect", width: 1.1, height: 1.8, layer: "front" },
  ],

  "SMB": [
    { id: "1", x: -2.0, y: 0, shape: "rect", width: 1.6, height: 2.2, layer: "front" },
    { id: "2", x: 2.0, y: 0, shape: "rect", width: 1.6, height: 2.2, layer: "front" },
  ],

  "LED_SMD_5050": [
    { id: "1", x: -2.45, y: -1.6, shape: "rect", width: 1.5, height: 1.0, layer: "front" },
    { id: "2", x: 2.45, y: -1.6, shape: "rect", width: 1.5, height: 1.0, layer: "front" },
    { id: "3", x: 2.45, y: 1.6, shape: "rect", width: 1.5, height: 1.0, layer: "front" },
    { id: "4", x: -2.45, y: 1.6, shape: "rect", width: 1.5, height: 1.0, layer: "front" },
  ],

  "USB_C_Receptacle": [
    { id: "VBUS", x: -1.75, y: -3.0, shape: "rect", width: 0.6, height: 1.2, layer: "front" },
    { id: "GND",  x: 1.75,  y: -3.0, shape: "rect", width: 0.6, height: 1.2, layer: "front" },
    { id: "CC1",  x: -0.5,  y: -3.0, shape: "rect", width: 0.3, height: 1.0, layer: "front" },
    { id: "CC2",  x: 0.5,   y: -3.0, shape: "rect", width: 0.3, height: 1.0, layer: "front" },
  ],

  "BarrelJack_TH": [
    { id: "1", x: 0,    y: -4.7, shape: "circle", width: 2.4, height: 2.4, drill: 1.2, layer: "through" },
    { id: "2", x: -3.0, y: 0,    shape: "circle", width: 2.4, height: 2.4, drill: 1.2, layer: "through" },
    { id: "3", x: 3.0,  y: 0,    shape: "circle", width: 2.4, height: 2.4, drill: 1.2, layer: "through" },
  ],

  "SOT-223": [
    { id: "1", x: -2.3, y: 3.15, shape: "rect", width: 0.95, height: 1.5, layer: "front" },
    { id: "2", x: 0,    y: 3.15, shape: "rect", width: 0.95, height: 1.5, layer: "front" },
    { id: "3", x: 2.3,  y: 3.15, shape: "rect", width: 0.95, height: 1.5, layer: "front" },
    { id: "4", x: 0,    y: -3.15, shape: "rect", width: 3.0, height: 1.5, layer: "front" },
  ],

  "SOT-23": [
    { id: "1", x: -0.95, y: 1.1, shape: "rect", width: 0.6, height: 0.7, layer: "front" },
    { id: "2", x: 0.95,  y: 1.1, shape: "rect", width: 0.6, height: 0.7, layer: "front" },
    { id: "3", x: 0,     y: -1.1, shape: "rect", width: 0.6, height: 0.7, layer: "front" },
  ],

  "TO-220_TH": [
    { id: "1", x: -2.54, y: 0, shape: "rect", width: 1.8, height: 1.8, drill: 1.0, layer: "through" },
    { id: "2", x: 0,     y: 0, shape: "circle", width: 1.8, height: 1.8, drill: 1.0, layer: "through" },
    { id: "3", x: 2.54,  y: 0, shape: "circle", width: 1.8, height: 1.8, drill: 1.0, layer: "through" },
  ],

  "TO-92_TH": [
    { id: "1", x: -1.27, y: 0, shape: "rect", width: 1.4, height: 1.4, drill: 0.75, layer: "through" },
    { id: "2", x: 0,     y: 0, shape: "circle", width: 1.4, height: 1.4, drill: 0.75, layer: "through" },
    { id: "3", x: 1.27,  y: 0, shape: "circle", width: 1.4, height: 1.4, drill: 0.75, layer: "through" },
  ],

  "SW_Push_6mm_TH": [
    { id: "A1", x: -3.25, y: -2.25, shape: "circle", width: 1.6, height: 1.6, drill: 0.9, layer: "through" },
    { id: "A2", x: 3.25,  y: -2.25, shape: "circle", width: 1.6, height: 1.6, drill: 0.9, layer: "through" },
    { id: "B1", x: -3.25, y: 2.25,  shape: "circle", width: 1.6, height: 1.6, drill: 0.9, layer: "through" },
    { id: "B2", x: 3.25,  y: 2.25,  shape: "circle", width: 1.6, height: 1.6, drill: 0.9, layer: "through" },
  ],

  "SW_Slide_SPDT_TH": [
    { id: "A",      x: -2.54, y: 0, shape: "circle", width: 1.6, height: 1.6, drill: 0.9, layer: "through" },
    { id: "Common", x: 0,     y: 0, shape: "rect", width: 1.6, height: 1.6, drill: 0.9, layer: "through" },
    { id: "B",      x: 2.54,  y: 0, shape: "circle", width: 1.6, height: 1.6, drill: 0.9, layer: "through" },
  ],

  "Potentiometer_TH": [
    { id: "1", x: -2.5, y: 5.0, shape: "circle", width: 1.6, height: 1.6, drill: 0.9, layer: "through" },
    { id: "2", x: 0,    y: 5.0, shape: "rect", width: 1.6, height: 1.6, drill: 0.9, layer: "through" },
    { id: "3", x: 2.5,  y: 5.0, shape: "circle", width: 1.6, height: 1.6, drill: 0.9, layer: "through" },
  ],

  "Buzzer_12mm_TH": [
    { id: "1", x: -3.25, y: 0, shape: "rect", width: 1.6, height: 1.6, drill: 0.8, layer: "through" },
    { id: "2", x: 3.25,  y: 0, shape: "circle", width: 1.6, height: 1.6, drill: 0.8, layer: "through" },
  ],

  "HC49_TH": [
    { id: "1", x: -2.44, y: 0, shape: "circle", width: 1.6, height: 1.6, drill: 0.8, layer: "through" },
    { id: "2", x: 2.44,  y: 0, shape: "circle", width: 1.6, height: 1.6, drill: 0.8, layer: "through" },
  ],

  "SIP-4_TH": pinHeaderPads(4),

  "LDR_TH": [
    { id: "1", x: -2.54, y: 0, shape: "circle", width: 1.6, height: 1.6, drill: 0.8, layer: "through" },
    { id: "2", x: 2.54,  y: 0, shape: "circle", width: 1.6, height: 1.6, drill: 0.8, layer: "through" },
  ],

  "BatteryHolder_2xAA": [
    { id: "1", x: -14.0, y: 0, shape: "rect", width: 2.5, height: 2.5, drill: 1.3, layer: "through" },
    { id: "2", x: 14.0,  y: 0, shape: "circle", width: 2.5, height: 2.5, drill: 1.3, layer: "through" },
  ],
  "BatteryHolder_18650": [
    { id: "1", x: -18.0, y: 0, shape: "rect", width: 2.5, height: 2.5, drill: 1.3, layer: "through" },
    { id: "2", x: 18.0,  y: 0, shape: "circle", width: 2.5, height: 2.5, drill: 1.3, layer: "through" },
  ],

  "DIP-8": dipPads(8),
  "DIP-16": dipPads(16),
  "DIP-28": dipPads(28),

  "PinHeader_1x2_P2.54mm": pinHeaderPads(2),
  "PinHeader_1x4_P2.54mm": pinHeaderPads(4),
  "PinHeader_1x6_P2.54mm": pinHeaderPads(6),

  "JST_PH_S3B-PH-K_1x3_P2.00mm": jstPhPads(3),
  "JST_PH_S4B-PH-K_1x4_P2.00mm": jstPhPads(4),

  "ScrewTerminal_1x2_P5.08mm": screwTerminalPads(2),

  "Module_DIP":        moduleDualRowPads(40, 22.86),
  "Module_DIP_40pin":  moduleDualRowPads(40, 17.78),
  "Module_DIP_30pin":  moduleDualRowPads(30, 15.24),
  "Module_4pin":       pinHeaderPads(4),
  "Module_3pin":       pinHeaderPads(3),
  "Module_6pin":       pinHeaderPads(6),
  "Module_8pin":       pinHeaderPads(8),
  "Module_10pin":      pinHeaderPads(10),
  "Module_16pin":      pinHeaderPads(16),
};

/**
 * Look up pad definitions for a package.
 * Falls back to dynamically generated pads based on pin count if package not found.
 */
function getPads(packageName: string, pinCount: number): PadDef[] {
  if (PACKAGE_PADS[packageName]) {
    return PACKAGE_PADS[packageName];
  }

  const headerMatch = packageName.match(/^PinHeader_1x(\d+)/);
  if (headerMatch) {
    return pinHeaderPads(parseInt(headerMatch[1], 10));
  }

  const jstMatch = packageName.match(/^JST_PH.*?(\d+).*?P2\.00mm/);
  if (jstMatch) {
    return jstPhPads(parseInt(jstMatch[1], 10));
  }

  const screwMatch = packageName.match(/^ScrewTerminal_1x(\d+)/);
  if (screwMatch) {
    return screwTerminalPads(parseInt(screwMatch[1], 10));
  }

  const dipMatch = packageName.match(/^DIP-(\d+)/);
  if (dipMatch) {
    return dipPads(parseInt(dipMatch[1], 10));
  }

  return pinHeaderPads(pinCount);
}

// ── Pad position computation ──

/**
 * Compute absolute board-level positions for every pad of every component.
 * Applies component rotation to pad offsets.
 */
export function computePadPositions(components: DesignComponent[]): AbsolutePadPosition[] {
  const result: AbsolutePadPosition[] = [];

  for (const comp of components) {
    const pads = getPads(comp.package, comp.pins.length);
    const { x: cx, y: cy, rotation } = comp.pcbPosition;
    const rad = (rotation * Math.PI) / 180;

    for (const pad of pads) {
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
 * Format pad positions as a human-readable text table for the AI prompt.
 * Example output line: "R1.1  (12.50, 8.00)"
 */
export function formatPadPositionTable(positions: AbsolutePadPosition[]): string {
  const lines: string[] = [];

  for (const pos of positions) {
    lines.push(`${pos.ref}.${pos.pinId}  (${pos.x.toFixed(2)}, ${pos.y.toFixed(2)})`);
  }

  return lines.join("\n");
}
