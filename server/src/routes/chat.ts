import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { getApiKey } from "../db.js";
import { decryptApiKey } from "../crypto.js";
import { buildSystemPrompt } from "../lib/buildPrompt.js";
import { validateDesign, formatValidationFeedback } from "../lib/validateDesign.js";

const router = Router();

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "dev-encryption-key";
const MAX_RETRIES = 2; // retry up to twice — electrical checks + layout quality checks

/**
 * Call the Anthropic API.
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

// POST /api/chat - Smart chat with validation and self-correction
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

  const systemPrompt = buildSystemPrompt();

  try {
    // First call to Claude
    let data = await callClaude(apiKey, systemPrompt, messages);
    let text = getResponseText(data);
    let design = extractJsonBlock(text);

    // If there's a design, validate it
    if (design) {
      const validation = validateDesign(design);

      if (!validation.valid && validation.errors.length > 0) {
        const feedback = formatValidationFeedback(validation);

        console.log(`[chat] Design validation failed (${validation.errors.length} errors, ${validation.warnings.length} warnings). Retrying...`);

        // Build a correction prompt and retry
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
          const correctionMessages = [
            ...messages,
            { role: "assistant" as const, content: text },
            {
              role: "user" as const,
              content: `[SYSTEM — internal validation, not from the user. The user will NOT see this message.]\n\nYour design has validation issues. Fix them and output the corrected complete CircuitDesign JSON.\n\nIMPORTANT: Write your response as if it is your FIRST response to the user. Do NOT mention validation errors, corrections, or fixes. Do NOT say "you're right" or "let me fix" — the user never saw the broken version. Just give a friendly design explanation and the corrected JSON.\n\n${feedback}`,
            },
          ];

          data = await callClaude(apiKey, systemPrompt, correctionMessages);
          text = getResponseText(data);
          design = extractJsonBlock(text);

          if (design) {
            const recheck = validateDesign(design);
            if (recheck.valid) {
              console.log(`[chat] Design corrected successfully on retry ${attempt + 1}`);
              break;
            }

            if (attempt === MAX_RETRIES - 1) {
              console.log(`[chat] Design still has ${recheck.errors.length} errors after ${MAX_RETRIES} retries. Returning as-is.`);
            }
          }
        }
      } else if (validation.warnings.length > 0) {
        console.log(`[chat] Design valid with ${validation.warnings.length} warnings`);
      } else {
        console.log("[chat] Design valid, no issues");
      }
    }

    // Return the (possibly corrected) response
    res.json(data);
  } catch (err) {
    console.error("Chat proxy error:", err);
    const status = (err as { status?: number }).status || 500;
    const message = err instanceof Error ? err.message : "Failed to contact Claude API";
    res.status(status).json({ error: message });
  }
});

export { router as chatRouter };
