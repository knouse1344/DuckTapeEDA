import type { CircuitDesign, ChatMessage } from "../types/circuit";
import { SYSTEM_PROMPT } from "./prompt";

interface ClaudeResponse {
  text: string;
  design: CircuitDesign | null;
}

export async function sendMessage(
  apiKey: string,
  messages: ChatMessage[]
): Promise<ClaudeResponse> {
  // Use proxy in dev, direct API in production
  const apiUrl = import.meta.env.DEV
    ? "/api/claude/v1/messages"
    : "https://api.anthropic.com/v1/messages";

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
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
      error?.error?.message || `API error: ${response.status}`;
    throw new Error(message);
  }

  const data = await response.json();
  const text: string = data.content
    .filter((block: { type: string }) => block.type === "text")
    .map((block: { text: string }) => block.text)
    .join("");

  const design = extractDesign(text);

  return { text: stripJsonBlock(text), design };
}

function extractDesign(text: string): CircuitDesign | null {
  const match = text.match(/```json\s*([\s\S]*?)```/);
  if (!match) return null;

  try {
    return JSON.parse(match[1]) as CircuitDesign;
  } catch {
    console.error("Failed to parse CircuitDesign JSON");
    return null;
  }
}

function stripJsonBlock(text: string): string {
  return text.replace(/```json\s*[\s\S]*?```/, "").trim();
}
