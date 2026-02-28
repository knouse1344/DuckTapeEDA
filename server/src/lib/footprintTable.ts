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

  if (gapX > 0 && gapY > 0) {
    return Math.sqrt(gapX * gapX + gapY * gapY);
  }
  return Math.max(gapX, gapY);
}
