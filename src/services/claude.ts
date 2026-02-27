import type { CircuitDesign, ChatMessage } from "../types/circuit";

export interface ClaudeResponse {
  text: string;
  design: CircuitDesign | null;
}

export async function sendMessageStreaming(
  token: string,
  messages: ChatMessage[],
  onDelta: (text: string) => void,
  onRefining?: () => void,
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
    // Non-SSE error response (e.g. 402 no API key, 400 bad request)
    const error = await response.json().catch(() => ({}));
    const message =
      (error as { error?: string })?.error || `API error: ${response.status}`;
    throw new Error(message);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";
  let replacedText: string | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    let currentEvent = "";
    for (const line of lines) {
      if (line.startsWith("event: ")) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith("data: ")) {
        const jsonStr = line.slice(6).trim();
        if (!jsonStr) continue;

        try {
          const data = JSON.parse(jsonStr);

          switch (currentEvent) {
            case "delta":
              fullText += data.text;
              onDelta(data.text);
              break;
            case "refining":
              onRefining?.();
              break;
            case "replace":
              replacedText = data.text;
              break;
            case "error":
              throw new Error(data.error || "Stream error");
          }
        } catch (e) {
          if (e instanceof Error && e.message !== "Stream error") {
            // JSON parse error — skip
          } else {
            throw e;
          }
        }
        currentEvent = "";
      }
    }
  }

  // Use replaced text if validation corrected the response
  const finalText = replacedText ?? fullText;
  const design = extractDesign(finalText);

  return { text: stripJsonBlock(finalText), design };
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
