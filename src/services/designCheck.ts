import type { CircuitDesign } from "../types/circuit";

export interface CheckFinding {
  severity: "pass" | "warning" | "error";
  category: string;
  title: string;
  detail: string;
  ref?: string;
}

/**
 * Run a two-pass design check: instant rule-based findings + streaming AI review.
 * Communicates via SSE events from the /api/design-check endpoint.
 */
export async function checkDesign(
  token: string,
  design: CircuitDesign,
  onRuleResults: (findings: CheckFinding[]) => void,
  onAiDelta: (text: string) => void,
): Promise<void> {
  const response = await fetch("/api/design-check", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ design }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const message =
      (error as { error?: string })?.error || `API error: ${response.status}`;
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
            case "rules":
              onRuleResults(data.findings as CheckFinding[]);
              break;
            case "delta":
              onAiDelta(data.text);
              break;
            case "error":
              throw new Error(data.error || "Check failed");
          }
        } catch (e) {
          if (e instanceof Error && e.message !== "Check failed") {
            // JSON parse error — skip
          } else {
            throw e;
          }
        }
        currentEvent = "";
      }
    }
  }
}
