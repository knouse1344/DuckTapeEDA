import { Router } from "express";
import type { Response } from "express";
import { requireAuth } from "../middleware/auth.js";
import { getApiKey } from "../db.js";
import { decryptApiKey } from "../crypto.js";
import { buildSystemPrompt } from "../lib/buildPrompt.js";
import { validateDesign, formatValidationFeedback, generateSpatialMap, checkBoardCapacity } from "../lib/validateDesign.js";
import { resolveOverlaps } from "../lib/resolveOverlaps.js";

const router = Router();

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "dev-encryption-key";
const MAX_RETRIES = 2;

/**
 * Send an SSE event to the client.
 */
function sendSSE(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/**
 * Call the Anthropic API (non-streaming, used for validation retries).
 */
async function callClaude(
  apiKey: string,
  systemPrompt: string,
  messages: { role: string; content: string }[]
): Promise<{ content: { type: string; text?: string }[]; stop_reason: string }> {
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
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const message =
      (error as { error?: { message?: string } })?.error?.message ||
      `Anthropic API error: ${response.status}`;
    const err = new Error(message) as Error & { status: number };
    err.status = response.status;
    throw err;
  }

  return response.json();
}

/**
 * Call the Anthropic API with streaming. Forwards text deltas to the client
 * via SSE and returns the accumulated full text when done.
 */
async function callClaudeStreaming(
  apiKey: string,
  systemPrompt: string,
  messages: { role: string; content: string }[],
  res: Response
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
      stream: true,
      system: systemPrompt,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const message =
      (error as { error?: { message?: string } })?.error?.message ||
      `Anthropic API error: ${response.status}`;
    const err = new Error(message) as Error & { status: number };
    err.status = response.status;
    throw err;
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let fullText = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    // Keep the last potentially incomplete line in the buffer
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
            fullText += event.delta.text;
            sendSSE(res, "delta", { text: event.delta.text });
          }
        } catch {
          // Skip unparseable lines
        }
      }
    }
  }

  return fullText;
}

/**
 * Extract JSON block from Claude's response text.
 */
function extractJsonBlock(text: string): unknown | null {
  const match = text.match(/```json\s*([\s\S]*?)```/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

/**
 * Get the full text from a Claude response.
 */
function getResponseText(data: { content: { type: string; text?: string }[] }): string {
  return data.content
    .filter((block) => block.type === "text")
    .map((block) => block.text || "")
    .join("");
}

// POST /api/chat - Streaming chat with validation and self-correction
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

  // Set up SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering
  res.flushHeaders();

  const systemPrompt = buildSystemPrompt();

  try {
    // Stream the first Claude response to the client
    let text = await callClaudeStreaming(apiKey, systemPrompt, messages, res);
    let design = extractJsonBlock(text);

    // If there's a design, validate it
    if (design) {
      const validation = validateDesign(design);

      if (!validation.valid && validation.errors.length > 0) {
        const feedback = formatValidationFeedback(validation);

        // Check if errors are spatial (overlaps / out-of-bounds)
        const hasOverlapErrors = validation.errors.some(
          (e) => e.code === "FOOTPRINT_OVERLAP" || e.code === "COMPONENT_OUT_OF_BOUNDS"
        );
        const hasNonSpatialErrors = validation.errors.some(
          (e) => e.code !== "FOOTPRINT_OVERLAP" && e.code !== "COMPONENT_OUT_OF_BOUNDS"
        );

        // Fix overlaps algorithmically — don't waste API calls on spatial math
        if (hasOverlapErrors && design) {
          const resolved = resolveOverlaps(design as Parameters<typeof resolveOverlaps>[0]);
          if (resolved) {
            console.log(`[chat] Overlap resolver fixed component positions`);
            // Re-serialize the fixed design back into the response text
            text = text.replace(
              /```json\s*[\s\S]*?```/,
              "```json\n" + JSON.stringify(design, null, 2) + "\n```"
            );

            // Re-validate after resolver
            const recheck = validateDesign(design);
            if (recheck.valid || !recheck.errors.some(
              (e) => e.code !== "FOOTPRINT_OVERLAP" && e.code !== "COMPONENT_OUT_OF_BOUNDS"
            )) {
              console.log(`[chat] Design valid after overlap resolution`);
              sendSSE(res, "replace", { text });
              res.end();
              return;
            }
            // If there are still non-spatial errors, fall through to retry loop
          }
        }

        console.log(`[chat] Design validation failed (${validation.errors.length} errors, ${validation.warnings.length} warnings). Retrying...`);

        // Tell client we're refining
        sendSSE(res, "refining", {});

        // Retry with non-streamed calls
        let currentFeedback = feedback;
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
          // On retries, enrich feedback with spatial context
          let spatialContext = "";
          if (design) {
            const spatialMap = generateSpatialMap(design as Parameters<typeof generateSpatialMap>[0]);
            const capacityWarning = checkBoardCapacity(design as Parameters<typeof checkBoardCapacity>[0]);
            if (spatialMap) spatialContext += `\n\nSPATIAL MAP (current component positions):\n${spatialMap}`;
            if (capacityWarning) spatialContext += `\n\nBOARD CAPACITY WARNING:\n${capacityWarning}`;
          }

          const correctionMessages = [
            ...messages,
            { role: "assistant" as const, content: text },
            {
              role: "user" as const,
              content: `[SYSTEM — internal validation, not from the user. The user will NOT see this message.]\n\nYour design has validation issues. Fix them and output the corrected complete CircuitDesign JSON.\n\nIMPORTANT: Write your response as if it is your FIRST response to the user. Do NOT mention validation errors, corrections, or fixes. Do NOT say "you're right" or "let me fix" — the user never saw the broken version. Just give a friendly design explanation and the corrected JSON.\n\n${currentFeedback}${spatialContext}`,
            },
          ];

          const data = await callClaude(apiKey, systemPrompt, correctionMessages);
          text = getResponseText(data);
          design = extractJsonBlock(text);

          if (design) {
            const recheck = validateDesign(design);
            if (recheck.valid) {
              console.log(`[chat] Design corrected successfully on retry ${attempt + 1}`);
              break;
            }

            // Update feedback for the next retry iteration
            currentFeedback = formatValidationFeedback(recheck);

            if (attempt === MAX_RETRIES - 1) {
              console.log(`[chat] Design still has ${recheck.errors.length} errors after ${MAX_RETRIES} retries. Returning as-is.`);
            }
          }
        }

        // Send the corrected full text as a replacement
        sendSSE(res, "replace", { text });
      } else if (validation.warnings.length > 0) {
        console.log(`[chat] Design valid with ${validation.warnings.length} warnings`);
      } else {
        console.log("[chat] Design valid, no issues");
      }
    }

    // Signal completion
    sendSSE(res, "done", {});
    res.end();
  } catch (err) {
    console.error("Chat proxy error:", err);
    const message = err instanceof Error ? err.message : "Failed to contact Claude API";
    sendSSE(res, "error", { error: message });
    res.end();
  }
});

export { router as chatRouter };
