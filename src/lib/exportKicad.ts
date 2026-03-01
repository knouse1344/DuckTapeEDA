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
 */
function buildNetMap(design: CircuitDesign): {
  netNames: string[];
  pinToNet: Map<string, number>;
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
    return `  (gr_rect
    (start 0 0) (end ${n(w)} ${n(h)})
    (stroke (width 0.05) (type solid))
    (fill none)
    (layer "Edge.Cuts")
    (uuid "${uuid()}")
  )`;
  }

  // Rounded rectangle: 4 lines + 4 arcs
  const cr = Math.min(r, w / 2, h / 2);
  const m = cr * (1 - Math.cos(Math.PI / 4));
  const lines: string[] = [];

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

  lines.push(`  (gr_text "${b.name}"
    (at ${n(b.position.x)} ${n(b.position.y)})
    (layer "${layer}")
    (uuid "${uuid()}")
    (effects (font (size ${n(fontSize)} ${n(fontSize)}) (thickness ${n(0.2 * b.scale)})) (justify left${mirror}))
  )`);

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

  const netDecls = netNames.map((name, i) =>
    `  (net ${i} "${name}")`
  ).join("\n");

  const footprints = design.components.map((comp) => {
    const pads = getPads(comp.package, comp.pins.length);
    return renderFootprint(comp, pads, netNames, pinToNet);
  }).join("\n\n");

  const outline = renderBoardOutline(design);

  const branding = renderBranding(design);

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
