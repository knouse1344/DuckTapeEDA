/**
 * Client-side footprint dimension lookup for PCB component rendering.
 *
 * Mirrors the server's resolution logic (server/src/lib/footprintTable.ts)
 * so the frontend can render components at correct physical sizes without
 * a server round-trip.
 *
 * Resolution priority:
 * 1. Value match — VALUE_FOOTPRINTS (exact or fuzzy by component value/name)
 * 2. Exact package match — PACKAGE_FOOTPRINTS[pkg]
 * 3. Dynamic sizing — PinHeader_1xN, JST_PH_ patterns
 * 4. Prefix match — iterate PACKAGE_FOOTPRINTS, check pkg.startsWith(key)
 * 5. Type default — TYPE_DEFAULTS[type]
 * 6. Generic fallback — 10x10mm
 */

export interface FootprintDimensions {
  width: number;
  height: number;
  keepout: number;
}

// ─── VALUE_FOOTPRINTS ────────────────────────────────────────
// Maps lowercase component values/names to footprint dimensions.
// These resolve ambiguous packages (e.g. Module_4pin) by matching
// the component's value string instead.
//
// Dimensions verified against server/src/lib/componentLibrary.ts
// where available; otherwise from task specification.

const VALUE_FOOTPRINTS: Record<string, FootprintDimensions> = {
  // ── Displays ──
  "lcd 1602 i2c":                              { width: 80.0, height: 36.0, keepout: 1.5 },
  "lcd 1602 display with i2c backpack":        { width: 80.0, height: 36.0, keepout: 1.5 },
  "ssd1306 oled":                              { width: 27.0, height: 27.0, keepout: 1.0 },
  "ssd1306 0.96\" oled display module (i2c)":  { width: 27.0, height: 27.0, keepout: 1.0 },

  // ── Sensors ──
  "dht22":                                     { width: 15.0, height: 20.0, keepout: 1.5 },
  "dht22 temperature & humidity sensor":       { width: 15.0, height: 20.0, keepout: 1.5 },
  "dht11":                                     { width: 12.0, height: 16.0, keepout: 1.5 },
  "dht11 temperature and humidity sensor":     { width: 12.0, height: 16.0, keepout: 1.5 },
  "hc-sr04":                                   { width: 45.0, height: 20.0, keepout: 1.5 },
  "hc-sr04 ultrasonic distance sensor":        { width: 45.0, height: 20.0, keepout: 1.5 },
  "bme280":                                    { width: 13.0, height: 10.0, keepout: 1.0 },
  "bme280 temp/humidity/pressure sensor module": { width: 13.0, height: 10.0, keepout: 1.0 },

  // ── Communication modules ──
  "esp-01":                                    { width: 25.0, height: 14.0, keepout: 1.0 },
  "esp-01 wifi module":                        { width: 25.0, height: 14.0, keepout: 1.0 },
  "hc-05":                                     { width: 27.0, height: 13.0, keepout: 1.0 },
  "hc-05 bluetooth serial module":             { width: 27.0, height: 13.0, keepout: 1.0 },
  "nrf24l01+":                                 { width: 29.0, height: 15.0, keepout: 1.0 },
  "nrf24l01+ 2.4ghz wireless module":          { width: 29.0, height: 15.0, keepout: 1.0 },

  // ── Power modules ──
  "mt3608":                                    { width: 36.0, height: 17.0, keepout: 1.0 },
  "mt3608 boost converter module":             { width: 36.0, height: 17.0, keepout: 1.0 },
  "l298n":                                     { width: 43.0, height: 43.0, keepout: 2.0 },
  "l298n dual h-bridge motor driver":          { width: 43.0, height: 43.0, keepout: 2.0 },

  // ── Motor drivers ──
  "drv8833":                                   { width: 18.0, height: 15.0, keepout: 1.0 },
  "drv8833 dual h-bridge motor driver module": { width: 18.0, height: 15.0, keepout: 1.0 },

  // ── Audio ──
  "max9814":                                   { width: 23.0, height: 16.0, keepout: 1.0 },
  "max9814 microphone amplifier module":       { width: 23.0, height: 16.0, keepout: 1.0 },

  // ── Dev boards / MCUs ──
  "arduino nano":                              { width: 43.0, height: 18.0, keepout: 1.5 },
  "esp32-devkit":                              { width: 52.0, height: 28.0, keepout: 1.5 },
  "esp32 devkit module":                       { width: 52.0, height: 28.0, keepout: 1.5 },
  "raspberry pi pico":                         { width: 51.0, height: 21.0, keepout: 1.5 },
  "raspberry pi pico (rp2040)":               { width: 51.0, height: 21.0, keepout: 1.5 },
  "arduino uno":                               { width: 69.0, height: 53.0, keepout: 2.0 },
  "arduino mega":                              { width: 102.0, height: 53.0, keepout: 2.0 },
  "teensy 4.0":                                { width: 36.0, height: 18.0, keepout: 1.5 },
  "adafruit feather":                          { width: 51.0, height: 23.0, keepout: 1.5 },
  "seeeduino xiao":                            { width: 21.0, height: 18.0, keepout: 1.0 },
  "wemos d1 mini":                             { width: 35.0, height: 26.0, keepout: 1.5 },
  "stm32 blue pill":                           { width: 53.0, height: 23.0, keepout: 1.5 },
};

// ─── PACKAGE_FOOTPRINTS ──────────────────────────────────────
// Copied from server/src/lib/footprintTable.ts (lines 25-84).

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

// ─── TYPE_DEFAULTS ───────────────────────────────────────────
// Copied from server/src/lib/footprintTable.ts (lines 89-99).

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
 * 1. Value match in VALUE_FOOTPRINTS (exact then fuzzy)
 * 2. Exact package name match in PACKAGE_FOOTPRINTS
 * 3. Dynamic PinHeader/JST sizing
 * 4. Prefix match in known packages
 * 5. Component type default
 * 6. Generic fallback (10x10mm)
 */
export function getFootprint(pkg: string, type?: string, value?: string): FootprintDimensions {
  // 1. Value match — resolves ambiguous packages like Module_4pin
  if (value) {
    const valueLower = value.toLowerCase();

    // Exact key match
    if (VALUE_FOOTPRINTS[valueLower]) {
      return VALUE_FOOTPRINTS[valueLower];
    }

    // Fuzzy match — check if any key is contained in the value or vice versa
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

  // 3. Dynamic sizing — handles PinHeader_1xN_P2.54mm, JST_PH_SxB-PH-K_1xN...
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

  // 4. Check for prefix matches in known packages
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
