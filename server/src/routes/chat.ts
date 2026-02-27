import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { getApiKey } from "../db.js";
import { decryptApiKey } from "../crypto.js";

const router = Router();

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "dev-encryption-key";

const SYSTEM_PROMPT = `You are DuckTape EDA, an expert electrical engineer that designs simple PCBs.
Tagline: "Hold your circuits together."

When the user describes a board, respond with TWO things:
1. A brief, friendly explanation of the design (2-3 sentences max)
2. A complete CircuitDesign JSON block

Design rules:
- Use the absolute minimum components needed
- Prefer through-hole for hobbyist builds unless SMD makes more sense
- Always include required support components (current limiting resistors for LEDs, decoupling caps for ICs, etc.)
- Provide real component values and packages
- Position components logically for both schematic and PCB layout
- Board size should be compact but hand-solderable
- Schematic positions should space components on a grid (multiples of 50) for clean wiring
- PCB positions should be in millimeters representing physical placement on the board

Output the JSON inside a \`\`\`json code fence after your explanation.

The JSON must conform to this TypeScript interface:

interface CircuitDesign {
  name: string;
  description: string;
  components: {
    ref: string;
    type: "resistor" | "capacitor" | "led" | "diode" | "connector" | "ic" | "mosfet" | "switch" | "regulator";
    value: string;
    package: string;
    partNumber?: string;
    description: string;
    pins: {
      id: string;
      name: string;
      type: "power" | "ground" | "signal" | "passive";
    }[];
    schematicPosition: { x: number; y: number; rotation: number };
    pcbPosition: { x: number; y: number; rotation: number };
  }[];
  connections: {
    netName: string;
    pins: { ref: string; pin: string }[];
    traceWidth?: number;
  }[];
  board: {
    width: number;
    height: number;
    layers: 2;
    cornerRadius: number;
  };
  notes: string[];
}

When refining an existing design based on follow-up messages, output the complete updated CircuitDesign JSON (not a partial diff).`;

// POST /api/chat - Proxy chat messages to Claude API
router.post("/", requireAuth, async (req, res) => {
  const keyData = getApiKey(req.user!.userId);
  if (!keyData) {
    res.status(402).json({ error: "No API key saved. Please add your Anthropic API key in settings." });
    return;
  }

  const apiKey = decryptApiKey(keyData.encrypted_key, keyData.iv, ENCRYPTION_KEY);

  const { messages } = req.body as {
    messages: { role: string; content: string }[];
  };

  if (!messages || !Array.isArray(messages)) {
    res.status(400).json({ error: "messages array is required" });
    return;
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      const message =
        (error as { error?: { message?: string } })?.error?.message ||
        `Anthropic API error: ${response.status}`;
      res.status(response.status).json({ error: message });
      return;
    }

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error("Chat proxy error:", err);
    res.status(500).json({ error: "Failed to contact Claude API" });
  }
});

export { router as chatRouter };
