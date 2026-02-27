import type { CircuitDesign, ChatMessage } from "../types/circuit";

interface ClaudeResponse {
  text: string;
  design: CircuitDesign | null;
}

export async function sendMessage(
  token: string,
  messages: ChatMessage[]
): Promise<ClaudeResponse> {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const message =
      (error as { error?: string })?.error || `API error: ${response.status}`;
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
