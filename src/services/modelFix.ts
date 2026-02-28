export interface ModelFixMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Send a model fix message to the server. Streams Claude's response via SSE
 * and notifies when the code has been written to disk.
 */
export async function sendModelFixMessage(
  token: string,
  componentValue: string,
  componentType: string,
  componentPackage: string,
  messages: ModelFixMessage[],
  onDelta: (text: string) => void,
  onApplied: (functionName: string) => void
): Promise<string> {
  const response = await fetch("/api/model-fix", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      componentValue,
      componentType,
      componentPackage,
      messages,
    }),
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
  let fullText = "";

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
            case "applied":
              onApplied(data.functionName);
              break;
            case "error":
              throw new Error(data.error || "Model fix failed");
          }
        } catch (e) {
          if (e instanceof Error && e.message !== "Model fix failed") {
            // JSON parse error — skip
          } else {
            throw e;
          }
        }
        currentEvent = "";
      }
    }
  }

  return fullText;
}

/**
 * Revert buildScene.ts to its previous backup.
 */
export async function revertModelFix(token: string): Promise<void> {
  const res = await fetch("/api/model-fix/revert", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(
      (error as { error?: string })?.error || "Revert failed"
    );
  }
}
