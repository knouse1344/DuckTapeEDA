/**
 * Build the system prompt and user message for the AI design review pass.
 */

interface DesignComponent {
  ref: string;
  type: string;
  value: string;
  package: string;
  description: string;
  pins: { id: string; name: string; type: string }[];
}

interface DesignConnection {
  netName: string;
  pins: { ref: string; pin: string }[];
  traceWidth?: number;
}

interface CircuitDesign {
  name: string;
  description: string;
  components: DesignComponent[];
  connections: DesignConnection[];
  board: { width: number; height: number; layers: number; cornerRadius: number; color?: string };
  notes: string[];
}

export function buildCheckPrompt(design: unknown): { systemPrompt: string; userMessage: string } {
  const d = design as CircuitDesign;

  const systemPrompt = `You are an expert PCB design reviewer. Your job is to thoroughly review a circuit design and identify any issues before the user sends it to JLCPCB for manufacturing.

You are reviewing for correctness, not style. Focus on things that would cause the board to NOT WORK or be hard to manufacture.

FORMAT YOUR RESPONSE EXACTLY LIKE THIS:

## Circuit Correctness
[Analyze whether the circuit accomplishes its stated purpose. Check that all connections are logically correct.]
Use ✅, ⚠️, or ❌ prefix for each finding.

## Component Values
[Verify resistor values, capacitor values, etc. Show your math.]
Use ✅, ⚠️, or ❌ prefix for each finding.

## Power Delivery
[Check the power path from source to all components. Estimate total current draw.]
Use ✅, ⚠️, or ❌ prefix for each finding.

## Protection & Best Practices
[Check for missing decoupling caps, pull-up/down resistors, ESD protection, reverse polarity protection.]
Use ✅, ⚠️, or ❌ prefix for each finding.

## JLCPCB Manufacturing
[Any concerns for standard 2-layer JLCPCB production? Board size, trace widths, component availability.]
Use ✅, ⚠️, or ❌ prefix for each finding.

---

**Score: X/10**

**Verdict:** One sentence — is this ready to send to JLCPCB?

RULES:
- Be concise. Each finding should be 1-2 sentences max.
- Show calculations where relevant (e.g., LED current = (5V - 2V) / 220Ω = 13.6mA).
- Do NOT suggest adding features or components beyond what the circuit needs to function correctly.
- Do NOT comment on aesthetic choices (board color, corner radius, component placement style).
- If the design is simple and correct, say so. Don't manufacture problems.
- Be encouraging but honest. Hobbyists are building this.`;

  // Build a human-readable summary of the design for the AI
  const componentSummary = d.components
    .map((c) => `  ${c.ref}: ${c.type} — ${c.value} (${c.package}) — ${c.description}`)
    .join("\n");

  const connectionSummary = d.connections
    .map((c) => `  ${c.netName}: ${c.pins.map((p) => `${p.ref}.${p.pin}`).join(" → ")}${c.traceWidth ? ` [${c.traceWidth}mm]` : ""}`)
    .join("\n");

  const userMessage = `Review this PCB design:

**Name:** ${d.name}
**Purpose:** ${d.description}
**Board:** ${d.board.width}mm × ${d.board.height}mm, ${d.board.layers}-layer${d.board.color ? `, ${d.board.color}` : ""}

**Components (${d.components.length}):**
${componentSummary}

**Connections (${d.connections.length}):**
${connectionSummary}

${d.notes.length > 0 ? `**Design Notes:**\n${d.notes.map((n) => `  • ${n}`).join("\n")}` : ""}

**Full Design JSON:**
\`\`\`json
${JSON.stringify(design, null, 2)}
\`\`\``;

  return { systemPrompt, userMessage };
}
