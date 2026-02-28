import { Router } from "express";
import type { Response } from "express";
import { requireAuth } from "../middleware/auth.js";
import { getApiKey } from "../db.js";
import { decryptApiKey } from "../crypto.js";
import { buildModelFixPrompt } from "../lib/buildModelFixPrompt.js";
import {
  resolveBuilder,
  extractFunction,
  extractHelperSignatures,
  replaceFunction,
  validateBuilderCode,
  extractCodeBlock,
  readBuildScene,
  writeBuildScene,
  backupBuildScene,
  restoreFromBackup,
} from "../lib/builderExtractor.js";

const router = Router();

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "dev-encryption-key";

// Simple mutex to prevent concurrent writes
let writing = false;

function sendSSE(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/**
 * Stream a Claude API call, forwarding text deltas to the client via SSE.
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
    throw new Error(message);
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

// POST /api/model-fix — Stream Claude's response, then write code to disk
router.post("/", requireAuth, async (req, res) => {
  if (writing) {
    res.status(409).json({ error: "A model fix is already in progress. Please wait." });
    return;
  }

  const keyData = getApiKey(req.user!.userId);
  if (!keyData) {
    res.status(402).json({ error: "No API key saved. Please add your Anthropic API key in settings." });
    return;
  }

  const apiKey = decryptApiKey(keyData.encrypted_key, keyData.iv, ENCRYPTION_KEY);

  const { componentValue, componentType, componentPackage, messages } = req.body as {
    componentValue: string;
    componentType: string;
    componentPackage: string;
    messages: { role: string; content: string }[];
  };

  if (!componentValue || !messages?.length) {
    res.status(400).json({ error: "componentValue and messages are required" });
    return;
  }

  // Set up SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  writing = true;

  try {
    // 1. Resolve which builder function to edit
    const builder = resolveBuilder(
      componentValue,
      componentType || "",
      componentPackage || ""
    );
    console.log(`[model-fix] Resolved builder: ${builder.functionName} for "${componentValue}"`);

    // 2. Read the file and extract the function
    const fileContent = readBuildScene();
    const extracted = extractFunction(fileContent, builder.functionName);

    if (!extracted) {
      sendSSE(res, "error", {
        error: `Could not find function "${builder.functionName}" in buildScene.ts`,
      });
      sendSSE(res, "done", {});
      res.end();
      return;
    }

    console.log(`[model-fix] Extracted ${builder.functionName} (lines ${extracted.startLine}-${extracted.endLine})`);

    // 3. Build the system prompt
    const helperSigs = extractHelperSignatures(fileContent);
    const systemPrompt = buildModelFixPrompt(extracted.sourceCode, helperSigs, {
      value: componentValue,
      type: componentType || "ic",
      package: componentPackage || "unknown",
    });

    // 4. Stream Claude's response
    const fullText = await callClaudeStreaming(apiKey, systemPrompt, messages, res);

    // 5. Extract the code block from Claude's response
    const newCode = extractCodeBlock(fullText);
    if (!newCode) {
      sendSSE(res, "error", {
        error: "Claude's response did not contain a code block. Try rephrasing your request.",
      });
      sendSSE(res, "done", {});
      res.end();
      return;
    }

    // 6. Validate the code before writing
    const validationError = validateBuilderCode(newCode, builder.functionName);
    if (validationError) {
      sendSSE(res, "error", {
        error: `Code validation failed: ${validationError}. The file was NOT modified.`,
      });
      sendSSE(res, "done", {});
      res.end();
      return;
    }

    // 7. Backup and write
    backupBuildScene(fileContent);
    const newContent = replaceFunction(fileContent, extracted, newCode);
    writeBuildScene(newContent);
    console.log(`[model-fix] Wrote updated ${builder.functionName} to disk`);

    sendSSE(res, "applied", { functionName: builder.functionName });
    sendSSE(res, "done", {});
    res.end();
  } catch (err) {
    console.error("[model-fix] Error:", err);
    const message = err instanceof Error ? err.message : "Model fix failed";
    sendSSE(res, "error", { error: message });
    sendSSE(res, "done", {});
    res.end();
  } finally {
    writing = false;
  }
});

// POST /api/model-fix/revert — Restore buildScene.ts from backup
router.post("/revert", requireAuth, async (_req, res) => {
  const restored = restoreFromBackup();
  if (restored) {
    console.log("[model-fix] Reverted buildScene.ts from backup");
    res.json({ success: true });
  } else {
    res.status(404).json({ error: "No backup available" });
  }
});

export { router as modelFixRouter };
