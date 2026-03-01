/**
 * Build a focused prompt for AI trace re-routing.
 *
 * Much smaller than the full system prompt — contains only routing rules,
 * pad positions, and the design JSON. Asks Claude to output ONLY a traces
 * JSON array (no prose, no full design).
 */

export function buildRoutePrompt(
  designJson: string,
  padPositionTable: string,
): { systemPrompt: string; userMessage: string } {

  const systemPrompt = `You are a PCB trace router. Given a circuit design with component positions and pad coordinates, generate copper traces connecting all pads according to the netlist.

ROUTING RULES:
- Each trace connects exactly TWO pads on the same net. A net with N pads needs N-1 traces (spanning tree).
- Each trace is a polyline: an array of {x, y} waypoints in mm (absolute board coordinates).
- The first point MUST be at the source pad center. The last point MUST be at the destination pad center.
- Use 45-degree or 90-degree bends only. Route with L-shaped or Z-shaped paths.
- All traces must stay within the board outline (0,0 to board.width, board.height).
- Minimum clearance between traces on different nets: 0.2mm (including trace width).
- Power traces (VBUS, VCC, GND, or nets with "power"/"ground" type pins): width 0.5mm.
- Signal traces: width 0.25mm.
- All traces on "front" copper layer.
- Keep traces simple — prefer short, direct paths with 1-2 bends maximum.
- Do NOT route traces through component footprint areas.

OUTPUT FORMAT:
Respond with ONLY a JSON array inside a \`\`\`json code fence. No prose, no explanation.
The array contains Trace objects:

\`\`\`
[
  {
    "netName": "NET_NAME",
    "width": 0.25,
    "layer": "front",
    "points": [{"x": 1.0, "y": 2.0}, {"x": 5.0, "y": 2.0}]
  }
]
\`\`\`

CRITICAL: Output ONLY the traces JSON array. Do not output the full design. Do not include any text outside the code fence.`;

  const userMessage = `Route traces for this design.

PAD POSITIONS (absolute board coordinates — use these as trace start/end points):
${padPositionTable}

DESIGN JSON (traces field is empty — you must generate it):
\`\`\`json
${designJson}
\`\`\``;

  return { systemPrompt, userMessage };
}
