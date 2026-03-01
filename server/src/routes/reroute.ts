import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { getApiKey } from "../db.js";
import { decryptApiKey } from "../crypto.js";
import { validateRoutes, formatValidationFeedback } from "../lib/validateDesign.js";
import { computePadPositions, formatPadPositionTable } from "../lib/padPositions.js";
import { buildRoutePrompt } from "../lib/buildRoutePrompt.js";

const router = Router();
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "dev-encryption-key";
const MAX_RETRIES = 2;

/**
 * Call Claude (non-streaming) and return the response text.
 */
async function callClaude(
  apiKey: string,
  systemPrompt: string,
  messages: { role: string; content: string }[],
): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8192,
      system: systemPrompt,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const message =
      (error as { error?: { message?: string } })?.error?.message ||
      `Anthropic API error: ${response.status}`;
    throw new Error(message);
  }

  const data = await response.json();
  return data.content
    .filter((block: { type: string }) => block.type === "text")
    .map((block: { text?: string }) => block.text || "")
    .join("");
}

/**
 * Extract a JSON array from a ```json code fence.
 */
function extractJsonArray(text: string): unknown[] | null {
  const match = text.match(/```json\s*([\s\S]*?)```/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// POST /api/reroute — AI trace re-routing for current layout
router.post("/", requireAuth, async (req, res) => {
  const keyData = getApiKey(req.user!.userId);
  if (!keyData) {
    res.status(402).json({ error: "No API key saved. Please add your Anthropic API key in settings." });
    return;
  }

  const apiKey = decryptApiKey(keyData.encrypted_key, keyData.iv, ENCRYPTION_KEY);
  const { design } = req.body as { design: unknown };

  if (!design || typeof design !== "object") {
    res.status(400).json({ error: "design object is required" });
    return;
  }

  const d = design as {
    components: { ref: string; package: string; pins: { id: string; name: string; type: string }[]; pcbPosition: { x: number; y: number; rotation: number } }[];
    connections: { netName: string; pins: { ref: string; pin: string }[]; traceWidth?: number }[];
    board: { width: number; height: number; layers: number; cornerRadius: number };
    [key: string]: unknown;
  };

  if (!d.components || !d.connections || !d.board) {
    res.status(400).json({ error: "design must have components, connections, and board" });
    return;
  }

  try {
    // Compute pad positions for the routing prompt
    const padPositions = computePadPositions(d.components);
    const padTable = formatPadPositionTable(padPositions);

    // Strip existing traces from the design JSON sent to Claude
    const designForPrompt = { ...d, traces: [] };
    const designJson = JSON.stringify(designForPrompt, null, 2);

    const { systemPrompt, userMessage } = buildRoutePrompt(designJson, padTable);

    let traces: unknown[] | null = null;
    let lastErrors = "";

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const messages: { role: string; content: string }[] = [
        { role: "user", content: userMessage },
      ];

      // On retries, append the validation errors as feedback
      if (attempt > 0 && lastErrors) {
        messages.push(
          { role: "assistant", content: "```json\n" + JSON.stringify(traces, null, 2) + "\n```" },
          { role: "user", content: `The traces have validation errors. Fix them and output the corrected traces JSON array.\n\n${lastErrors}` },
        );
      }

      const text = await callClaude(apiKey, systemPrompt, messages);
      traces = extractJsonArray(text);

      if (!traces) {
        console.log(`[reroute] Attempt ${attempt + 1}: no valid JSON array in response`);
        lastErrors = "Response did not contain a valid JSON array of traces.";
        continue;
      }

      // Validate by constructing a temporary design with the new traces
      const testDesign = { ...d, traces };
      const issues = validateRoutes(testDesign);
      const errors = issues.filter(i => i.severity === "error");
      const warnings = issues.filter(i => i.severity === "warning");

      if (errors.length === 0) {
        console.log(`[reroute] Success on attempt ${attempt + 1} (${traces.length} traces)`);
        res.json({ traces });
        return;
      }

      console.log(`[reroute] Attempt ${attempt + 1}: ${errors.length} errors`);
      lastErrors = formatValidationFeedback({ valid: false, errors, warnings });
    }

    // Return best-effort traces even if validation still has issues
    console.log(`[reroute] Returning traces after ${MAX_RETRIES + 1} attempts (may have issues)`);
    res.json({ traces: traces || [] });
  } catch (err) {
    console.error("[reroute] Error:", err);
    const message = err instanceof Error ? err.message : "Re-route failed";
    res.status(500).json({ error: message });
  }
});

export { router as rerouteRouter };
