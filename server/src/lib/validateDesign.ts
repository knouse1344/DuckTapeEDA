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

interface DesignBranding {
  layer: string;
  layout: string;
  position: { x: number; y: number };
  scale: number;
  name: string;
  version: string;
}

interface CircuitDesign {
  name: string;
  description: string;
  components: DesignComponent[];
  connections: DesignConnection[];
  board: DesignBoard;
  notes: string[];
  branding?: DesignBranding;
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

  // ─── WS2812B TYPE CHECK ──────────────────────────────
  // WS2812B must be typed as "ic", not "led" — it has a built-in controller
  const ws2812Comps = components.filter(
    (c) => c.value?.toLowerCase().includes("ws2812") || c.partNumber?.toLowerCase().includes("ws2812")
  );
  for (const ws of ws2812Comps) {
    if (ws.type === "led") {
      issues.push({
        severity: "error",
        code: "WS2812_WRONG_TYPE",
        message: `${ws.ref} is a WS2812B addressable LED but has type "led". WS2812B MUST have type "ic" because it contains a built-in driver chip. Change its type to "ic". It does NOT need a current-limiting resistor.`,
        ref: ws.ref,
      });
    }
  }

  // ─── WS2812B DECOUPLING CAP CHECK ─────────────────────
  if (ws2812Comps.length > 0 && capRefs.length === 0) {
    issues.push({
      severity: "error",
      code: "WS2812_NO_DECOUPLING",
      message: `Design has ${ws2812Comps.length} WS2812B LED(s) (${ws2812Comps.map((c) => c.ref).join(", ")}) but no decoupling capacitors. Each WS2812B MUST have a 100nF ceramic capacitor between VDD and VSS, placed as close as possible to the LED.`,
    });
  }

  // ─── CONNECTOR PLACEMENT CHECK ─────────────────────────
  // Connectors should be at board edges so cables can plug in from outside
  if (board && board.width > 0 && board.height > 0) {
    const connectorComps = components.filter((c) => c.type === "connector");
    const edgeThreshold = 3; // mm — how close to edge counts as "at edge"
    for (const conn of connectorComps) {
      if (!isValidPosition(conn.pcbPosition)) continue;
      const { x, y } = conn.pcbPosition;
      const nearLeftEdge = x <= edgeThreshold;
      const nearRightEdge = x >= board.width - edgeThreshold;
      const nearTopEdge = y <= edgeThreshold;
      const nearBottomEdge = y >= board.height - edgeThreshold;
      const atEdge = nearLeftEdge || nearRightEdge || nearTopEdge || nearBottomEdge;

      if (!atEdge) {
        issues.push({
          severity: "error",
          code: "CONNECTOR_NOT_AT_EDGE",
          message: `Connector ${conn.ref} (${conn.value}) is at PCB position (${x}, ${y}) which is not near any board edge. Connectors must be placed at a board edge so cables can plug in from outside. Move it to x=0, x=${board.width}, y=0, or y=${board.height}.`,
          ref: conn.ref,
        });
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

  // ─── BRANDING CHECKS (optional, decorative) ──────────────
  if (d.branding && typeof d.branding === "object") {
    const b = d.branding as DesignBranding;

    if (b.layer && !["front", "back"].includes(b.layer)) {
      issues.push({
        severity: "warning",
        code: "BAD_BRANDING_LAYER",
        message: `Branding layer "${b.layer}" should be "front" or "back"`,
      });
    }

    if (b.layout && !["stacked", "horizontal"].includes(b.layout)) {
      issues.push({
        severity: "warning",
        code: "BAD_BRANDING_LAYOUT",
        message: `Branding layout "${b.layout}" should be "stacked" or "horizontal"`,
      });
    }

    if (board && b.position && typeof b.position.x === "number" && typeof b.position.y === "number") {
      const { x, y } = b.position;
      if (x < 0 || x > board.width || y < 0 || y > board.height) {
        issues.push({
          severity: "warning",
          code: "BRANDING_OFF_BOARD",
          message: `Branding position (${x}, ${y}) is outside board bounds (${board.width}x${board.height}mm)`,
        });
      }
    }

    if (typeof b.scale === "number" && (b.scale < 0.3 || b.scale > 5)) {
      issues.push({
        severity: "warning",
        code: "BAD_BRANDING_SCALE",
        message: `Branding scale ${b.scale} seems unusual (expected 0.3-5)`,
      });
    }

    if (b.version && typeof b.version === "string" && !/^\d{1,2}-\d{2}\s+v\d+$/.test(b.version)) {
      issues.push({
        severity: "warning",
        code: "BAD_BRANDING_VERSION",
        message: `Branding version "${b.version}" doesn't match expected "M-YY vN" format`,
      });
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

  // ─── LAYOUT QUALITY CHECKS ────────────────────────────
  // "Second brain" — catches aesthetic/layout issues and feeds them back
  // through the self-correction loop, just like electrical errors.
  if (board && board.width > 0 && board.height > 0) {
    const positionedComps = components.filter((c) => isValidPosition(c.pcbPosition));
    // Exclude connectors from centering/clustering checks — connectors are
    // intentionally placed at board edges, so they'd skew the center calculation.
    const nonConnectors = positionedComps.filter((c) => c.type !== "connector");

    if (nonConnectors.length >= 1) {
      // Bounding box of non-connector components only
      const xs = nonConnectors.map((c) => c.pcbPosition.x);
      const ys = nonConnectors.map((c) => c.pcbPosition.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const clusterCenterX = (minX + maxX) / 2;
      const clusterCenterY = (minY + maxY) / 2;
      const boardCenterX = board.width / 2;
      const boardCenterY = board.height / 2;

      // Component centering — are non-connector components roughly centered?
      const offsetX = Math.abs(clusterCenterX - boardCenterX);
      const offsetY = Math.abs(clusterCenterY - boardCenterY);
      // Use 20% of board size or 3mm, whichever is larger
      const maxAllowedOffsetX = Math.max(board.width * 0.2, 3);
      const maxAllowedOffsetY = Math.max(board.height * 0.2, 3);

      if (offsetX > maxAllowedOffsetX || offsetY > maxAllowedOffsetY) {
        issues.push({
          severity: "error",
          code: "COMPONENTS_OFF_CENTER",
          message: `Non-connector components are off-center. Their center is at (${clusterCenterX.toFixed(1)}, ${clusterCenterY.toFixed(1)}) but the board center is (${boardCenterX.toFixed(1)}, ${boardCenterY.toFixed(1)}). Reposition the IC, capacitor, resistor, and other non-connector components toward the board center. Connectors should stay at board edges.`,
        });
      }

      // Board utilization — is the board way too big for the components?
      const clusterW = maxX - minX + 4; // add ~4mm for component bodies
      const clusterH = maxY - minY + 4;
      const utilization = (clusterW * clusterH) / (board.width * board.height);
      if (utilization < 0.15 && board.width * board.height > 200) {
        issues.push({
          severity: "warning",
          code: "LOW_BOARD_UTILIZATION",
          message: `Components only use about ${Math.round(utilization * 100)}% of the board area (${board.width}x${board.height}mm). Consider making the board smaller to fit the components more tightly, or spread components out to use the space better.`,
        });
      }

      // One-axis clustering — all components bunched on one side?
      if (nonConnectors.length >= 2) {
        const ncSpanX = maxX - minX;
        const ncSpanY = maxY - minY;

        // If components span less than 20% of an axis on a board > 20mm in that dimension
        if (ncSpanX < board.width * 0.2 && board.width > 20) {
          issues.push({
            severity: "warning",
            code: "CLUSTERED_X",
            message: `Non-connector components are all bunched within ${ncSpanX.toFixed(1)}mm horizontally on a ${board.width}mm wide board. Spread them out or make the board narrower.`,
          });
        }
        if (ncSpanY < board.height * 0.2 && board.height > 20) {
          issues.push({
            severity: "warning",
            code: "CLUSTERED_Y",
            message: `Non-connector components are all bunched within ${ncSpanY.toFixed(1)}mm vertically on a ${board.height}mm tall board. Spread them out or make the board shorter.`,
          });
        }
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
