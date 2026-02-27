/**
 * Design Validation Engine
 *
 * Validates a CircuitDesign JSON object for correctness before rendering.
 * Returns a list of errors (must fix) and warnings (should fix).
 * Errors can be fed back to Claude for self-correction.
 */

interface DesignComponent {
  ref: string;
  type: string;
  value: string;
  package: string;
  partNumber?: string;
  description: string;
  pins: { id: string; name: string; type: string }[];
  schematicPosition: { x: number; y: number; rotation: number };
  pcbPosition: { x: number; y: number; rotation: number };
}

interface DesignConnection {
  netName: string;
  pins: { ref: string; pin: string }[];
  traceWidth?: number;
}

interface DesignBoard {
  width: number;
  height: number;
  layers: number;
  cornerRadius: number;
}

interface CircuitDesign {
  name: string;
  description: string;
  components: DesignComponent[];
  connections: DesignConnection[];
  board: DesignBoard;
  notes: string[];
}

export interface ValidationIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
  /** Which component/connection is affected */
  ref?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

const VALID_TYPES = [
  "resistor", "capacitor", "led", "diode", "connector",
  "ic", "mosfet", "switch", "regulator",
];

/**
 * Validate a parsed CircuitDesign object.
 */
export function validateDesign(design: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];

  // ─── STRUCTURAL CHECKS ──────────────────────────────────
  if (!design || typeof design !== "object") {
    return { valid: false, errors: [{ severity: "error", code: "INVALID_JSON", message: "Design is not a valid object" }], warnings: [] };
  }

  const d = design as Record<string, unknown>;

  if (typeof d.name !== "string" || !d.name) {
    issues.push({ severity: "error", code: "MISSING_NAME", message: "Design is missing a 'name' field" });
  }
  if (typeof d.description !== "string") {
    issues.push({ severity: "error", code: "MISSING_DESC", message: "Design is missing a 'description' field" });
  }
  if (!Array.isArray(d.components) || d.components.length === 0) {
    issues.push({ severity: "error", code: "NO_COMPONENTS", message: "Design has no components" });
    return toResult(issues);
  }
  if (!Array.isArray(d.connections)) {
    issues.push({ severity: "error", code: "NO_CONNECTIONS", message: "Design is missing 'connections' array" });
    return toResult(issues);
  }
  if (!d.board || typeof d.board !== "object") {
    issues.push({ severity: "error", code: "NO_BOARD", message: "Design is missing 'board' specification" });
  }
  if (!Array.isArray(d.notes)) {
    issues.push({ severity: "warning", code: "NO_NOTES", message: "Design is missing 'notes' array (should be present, even if empty)" });
  }

  const components = d.components as DesignComponent[];
  const connections = d.connections as DesignConnection[];
  const board = d.board as DesignBoard | undefined;

  // ─── COMPONENT CHECKS ──────────────────────────────────
  const refs = new Set<string>();
  const componentPins = new Map<string, Set<string>>(); // ref -> set of pin IDs

  for (const comp of components) {
    // Duplicate refs
    if (refs.has(comp.ref)) {
      issues.push({ severity: "error", code: "DUPLICATE_REF", message: `Duplicate component reference: ${comp.ref}`, ref: comp.ref });
    }
    refs.add(comp.ref);

    // Valid type
    if (!VALID_TYPES.includes(comp.type)) {
      issues.push({ severity: "error", code: "INVALID_TYPE", message: `Component ${comp.ref} has invalid type '${comp.type}'. Valid types: ${VALID_TYPES.join(", ")}`, ref: comp.ref });
    }

    // Has pins
    if (!Array.isArray(comp.pins) || comp.pins.length === 0) {
      issues.push({ severity: "error", code: "NO_PINS", message: `Component ${comp.ref} has no pins defined`, ref: comp.ref });
    } else {
      const pinIds = new Set<string>();
      for (const pin of comp.pins) {
        if (!pin.id) {
          issues.push({ severity: "error", code: "EMPTY_PIN_ID", message: `Component ${comp.ref} has a pin with empty id`, ref: comp.ref });
        }
        if (pinIds.has(pin.id)) {
          issues.push({ severity: "error", code: "DUPLICATE_PIN", message: `Component ${comp.ref} has duplicate pin id '${pin.id}'`, ref: comp.ref });
        }
        pinIds.add(pin.id);
      }
      componentPins.set(comp.ref, pinIds);
    }

    // Has positions
    if (!isValidPosition(comp.schematicPosition)) {
      issues.push({ severity: "error", code: "BAD_SCHEM_POS", message: `Component ${comp.ref} has invalid schematicPosition`, ref: comp.ref });
    }
    if (!isValidPosition(comp.pcbPosition)) {
      issues.push({ severity: "error", code: "BAD_PCB_POS", message: `Component ${comp.ref} has invalid pcbPosition`, ref: comp.ref });
    }

    // Value and package present
    if (!comp.value) {
      issues.push({ severity: "warning", code: "NO_VALUE", message: `Component ${comp.ref} has no value specified`, ref: comp.ref });
    }
    if (!comp.package) {
      issues.push({ severity: "warning", code: "NO_PACKAGE", message: `Component ${comp.ref} has no package specified`, ref: comp.ref });
    }
  }

  // ─── CONNECTION CHECKS ──────────────────────────────────
  const netNames = new Set<string>();
  const connectedPins = new Set<string>(); // "ref:pin" strings

  for (const conn of connections) {
    if (!conn.netName) {
      issues.push({ severity: "error", code: "NO_NET_NAME", message: "Connection has empty netName" });
    }
    if (netNames.has(conn.netName)) {
      issues.push({ severity: "warning", code: "DUPLICATE_NET", message: `Duplicate net name '${conn.netName}' — nets should be unique. Merge pins into one connection entry.` });
    }
    netNames.add(conn.netName);

    if (!Array.isArray(conn.pins) || conn.pins.length < 2) {
      issues.push({ severity: "error", code: "NET_TOO_SMALL", message: `Net '${conn.netName}' has fewer than 2 pins — a net must connect at least 2 pins` });
    }

    for (const pinRef of conn.pins) {
      if (!refs.has(pinRef.ref)) {
        issues.push({ severity: "error", code: "BAD_PIN_REF", message: `Net '${conn.netName}' references non-existent component '${pinRef.ref}'` });
      } else {
        const validPins = componentPins.get(pinRef.ref);
        if (validPins && !validPins.has(pinRef.pin)) {
          issues.push({ severity: "error", code: "BAD_PIN_ID", message: `Net '${conn.netName}' references non-existent pin '${pinRef.pin}' on component '${pinRef.ref}'. Valid pins: ${[...validPins].join(", ")}`, ref: pinRef.ref });
        }
        connectedPins.add(`${pinRef.ref}:${pinRef.pin}`);
      }
    }
  }

  // ─── FLOATING PIN CHECKS ────────────────────────────────
  for (const comp of components) {
    if (!Array.isArray(comp.pins)) continue;
    for (const pin of comp.pins) {
      const key = `${comp.ref}:${pin.id}`;
      if (!connectedPins.has(key)) {
        // Power and ground pins MUST be connected
        if (pin.type === "power" || pin.type === "ground") {
          issues.push({ severity: "error", code: "FLOATING_POWER_PIN", message: `${pin.type.toUpperCase()} pin '${pin.name}' (${pin.id}) on ${comp.ref} is not connected to any net`, ref: comp.ref });
        }
        // Signal pins get a warning (some may legitimately be NC)
        else if (pin.type === "signal") {
          issues.push({ severity: "warning", code: "FLOATING_SIGNAL", message: `Signal pin '${pin.name}' (${pin.id}) on ${comp.ref} is not connected`, ref: comp.ref });
        }
        // Passive pins on 2-pin parts should be connected
        else if (pin.type === "passive" && comp.pins.length <= 2) {
          issues.push({ severity: "error", code: "FLOATING_PASSIVE", message: `Pin '${pin.name}' (${pin.id}) on ${comp.ref} is not connected to any net — both pins of a ${comp.type} must be connected`, ref: comp.ref });
        }
      }
    }
  }

  // ─── DESIGN RULE CHECKS ─────────────────────────────────

  // LED without resistor check
  const ledRefs = components.filter((c) => c.type === "led").map((c) => c.ref);
  const resistorRefs = components.filter((c) => c.type === "resistor").map((c) => c.ref);
  if (ledRefs.length > 0 && resistorRefs.length === 0) {
    issues.push({ severity: "error", code: "LED_NO_RESISTOR", message: "Design has LEDs but no current-limiting resistors. Every LED needs a series resistor to prevent burnout." });
  }

  // IC without decoupling cap check
  const icRefs = components.filter((c) => ["ic", "regulator"].includes(c.type));
  const capRefs = components.filter((c) => c.type === "capacitor");
  if (icRefs.length > 0 && capRefs.length === 0) {
    issues.push({ severity: "warning", code: "IC_NO_DECOUPLING", message: `Design has ICs/regulators (${icRefs.map((c) => c.ref).join(", ")}) but no decoupling capacitors. Each IC should have a 100nF cap between its VCC and GND pins.` });
  }

  // USB-C without CC pull-down resistors
  const usbConnectors = components.filter(
    (c) => c.type === "connector" && (c.package?.toLowerCase().includes("usb_c") || c.value?.toLowerCase().includes("usb-c"))
  );
  for (const usb of usbConnectors) {
    const ccPins = usb.pins.filter((p) => p.name.toLowerCase().startsWith("cc"));
    for (const cc of ccPins) {
      const key = `${usb.ref}:${cc.id}`;
      if (!connectedPins.has(key)) {
        issues.push({ severity: "error", code: "USB_C_NO_CC", message: `USB-C connector ${usb.ref} pin '${cc.name}' needs a 5.1k pull-down resistor to GND for proper USB-C power negotiation`, ref: usb.ref });
      }
    }
  }

  // ─── BOARD CHECKS ───────────────────────────────────────
  if (board) {
    if (typeof board.width !== "number" || board.width <= 0 || board.width > 300) {
      issues.push({ severity: "error", code: "BAD_BOARD_WIDTH", message: `Board width ${board.width}mm is invalid (must be 1-300mm)` });
    }
    if (typeof board.height !== "number" || board.height <= 0 || board.height > 300) {
      issues.push({ severity: "error", code: "BAD_BOARD_HEIGHT", message: `Board height ${board.height}mm is invalid (must be 1-300mm)` });
    }

    // Check components fit on board
    if (board.width > 0 && board.height > 0) {
      for (const comp of components) {
        if (!isValidPosition(comp.pcbPosition)) continue;
        const { x, y } = comp.pcbPosition;
        if (x < 0 || x > board.width || y < 0 || y > board.height) {
          issues.push({ severity: "warning", code: "COMP_OFF_BOARD", message: `Component ${comp.ref} at PCB position (${x}, ${y}) may be outside board bounds (${board.width}x${board.height}mm)`, ref: comp.ref });
        }
      }
    }
  }

  // ─── OVERLAP CHECK ──────────────────────────────────────
  for (let i = 0; i < components.length; i++) {
    for (let j = i + 1; j < components.length; j++) {
      const a = components[i];
      const b = components[j];
      if (!isValidPosition(a.pcbPosition) || !isValidPosition(b.pcbPosition)) continue;
      const dist = Math.sqrt(
        (a.pcbPosition.x - b.pcbPosition.x) ** 2 +
        (a.pcbPosition.y - b.pcbPosition.y) ** 2
      );
      if (dist < 1.5) {
        issues.push({ severity: "warning", code: "OVERLAP", message: `Components ${a.ref} and ${b.ref} are only ${dist.toFixed(1)}mm apart on PCB — they may overlap`, ref: a.ref });
      }
    }
  }

  return toResult(issues);
}

function isValidPosition(pos: unknown): pos is { x: number; y: number; rotation: number } {
  if (!pos || typeof pos !== "object") return false;
  const p = pos as Record<string, unknown>;
  return typeof p.x === "number" && typeof p.y === "number" && typeof p.rotation === "number";
}

function toResult(issues: ValidationIssue[]): ValidationResult {
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Format validation issues into a string that can be sent back to Claude
 * for self-correction.
 */
export function formatValidationFeedback(result: ValidationResult): string {
  if (result.valid && result.warnings.length === 0) return "";

  const lines: string[] = [];

  if (result.errors.length > 0) {
    lines.push("ERRORS (must fix):");
    for (const e of result.errors) {
      lines.push(`  - [${e.code}] ${e.message}`);
    }
  }

  if (result.warnings.length > 0) {
    lines.push("WARNINGS (should fix):");
    for (const w of result.warnings) {
      lines.push(`  - [${w.code}] ${w.message}`);
    }
  }

  return lines.join("\n");
}
