import { Router } from "express";
import type { Response } from "express";
import { requireAuth } from "../middleware/auth.js";
import { getApiKey } from "../db.js";
import { decryptApiKey } from "../crypto.js";
import { validateDesign } from "../lib/validateDesign.js";
import { buildCheckPrompt } from "../lib/buildCheckPrompt.js";

const router = Router();

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "dev-encryption-key";

interface CheckFinding {
  severity: "pass" | "warning" | "error";
  category: string;
  title: string;
  detail: string;
  ref?: string;
}

function sendSSE(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/**
 * Map validation issue codes to user-friendly categories.
 */
const CATEGORY_MAP: Record<string, string> = {
  FLOATING_POWER_PIN: "connections",
  FLOATING_PASSIVE: "connections",
  FLOATING_SIGNAL: "connections",
  LED_NO_RESISTOR: "protection",
  IC_NO_DECOUPLING: "protection",
  WS2812_NO_DECOUPLING: "protection",
  USB_C_NO_CC: "protection",
  WS2812_WRONG_TYPE: "structure",
  OVERLAP: "layout",
  COMP_OFF_BOARD: "layout",
  COMPONENTS_OFF_CENTER: "layout",
  LOW_BOARD_UTILIZATION: "layout",
  CLUSTERED_X: "layout",
  CLUSTERED_Y: "layout",
  CONNECTOR_NOT_AT_EDGE: "layout",
  DUPLICATE_REF: "structure",
  INVALID_TYPE: "structure",
  NO_PINS: "structure",
  BAD_PIN_REF: "connections",
  BAD_PIN_ID: "connections",
  NET_TOO_SMALL: "connections",
  DUPLICATE_NET: "connections",
  BAD_BOARD_WIDTH: "manufacturing",
  BAD_BOARD_HEIGHT: "manufacturing",
};

/**
 * Convert validation issues into user-friendly CheckFindings.
 */
function transformValidationResults(design: unknown): CheckFinding[] {
  const result = validateDesign(design);
  const findings: CheckFinding[] = [];

  for (const issue of [...result.errors, ...result.warnings]) {
    // Skip internal structural checks that aren't useful to show users
    if (["MISSING_NAME", "MISSING_DESC", "NO_NOTES", "NO_VALUE", "NO_PACKAGE",
         "BAD_SCHEM_POS", "BAD_PCB_POS", "EMPTY_PIN_ID", "DUPLICATE_PIN",
         "NO_COMPONENTS", "NO_CONNECTIONS", "NO_BOARD", "INVALID_JSON"].includes(issue.code)) {
      continue;
    }

    findings.push({
      severity: issue.severity === "error" ? "error" : "warning",
      category: CATEGORY_MAP[issue.code] || "general",
      title: humanizeCode(issue.code),
      detail: issue.message,
      ref: issue.ref,
    });
  }

  // Add JLCPCB manufacturing checks
  const d = design as Record<string, unknown>;
  const board = d.board as { width: number; height: number } | undefined;
  if (board) {
    if (board.width < 10 || board.height < 10) {
      findings.push({
        severity: "warning",
        category: "manufacturing",
        title: "Small board size",
        detail: `Board is ${board.width}×${board.height}mm. JLCPCB minimum is technically 10×10mm for economical production. Smaller boards may incur extra fees.`,
      });
    }
  }

  // Check trace widths
  const connections = d.connections as { netName: string; traceWidth?: number }[] | undefined;
  if (connections) {
    for (const conn of connections) {
      if (conn.traceWidth !== undefined && conn.traceWidth < 0.15) {
        findings.push({
          severity: "error",
          category: "manufacturing",
          title: "Trace too narrow",
          detail: `Net "${conn.netName}" has trace width ${conn.traceWidth}mm — JLCPCB minimum is 0.15mm (6mil).`,
        });
      }
    }
  }

  // If nothing found, add an all-pass finding
  if (findings.length === 0) {
    findings.push({
      severity: "pass",
      category: "general",
      title: "All quick checks passed",
      detail: "No structural, connection, or manufacturing issues detected.",
    });
  }

  return findings;
}

/**
 * Turn codes like "LED_NO_RESISTOR" into "LED no resistor".
 */
function humanizeCode(code: string): string {
  return code.replace(/_/g, " ").replace(/\b\w/, (c) => c.toUpperCase()).toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

// POST /api/design-check — Two-pass design review
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

  // Set up SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  try {
    // ── Pass 1: Rule-based checks (instant) ──────────────
    const findings = transformValidationResults(design);
    sendSSE(res, "rules", { findings });

    // ── Pass 2: AI review (streaming) ────────────────────
    const { systemPrompt, userMessage } = buildCheckPrompt(design);

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
        stream: true,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      const message =
        (error as { error?: { message?: string } })?.error?.message ||
        `Anthropic API error: ${response.status}`;
      throw new Error(message);
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const jsonStr = line.slice(6).trim();
          if (!jsonStr || jsonStr === "[DONE]") continue;

          try {
            const event = JSON.parse(jsonStr);
            if (
              event.type === "content_block_delta" &&
              event.delta?.type === "text_delta" &&
              event.delta.text
            ) {
              sendSSE(res, "delta", { text: event.delta.text });
            }
          } catch {
            // Skip unparseable lines
          }
        }
      }
    }

    sendSSE(res, "done", {});
    res.end();
  } catch (err) {
    console.error("Design check error:", err);
    const message = err instanceof Error ? err.message : "Design check failed";
    sendSSE(res, "error", { error: message });
    res.end();
  }
});

export { router as designCheckRouter };
