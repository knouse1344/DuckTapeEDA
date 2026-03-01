import type { CircuitDesign, Trace } from "../types/circuit";

/**
 * Call the server to AI-generate trace routes for the current design.
 * Returns the new traces array on success.
 */
export async function rerouteTraces(
  token: string,
  design: CircuitDesign,
): Promise<Trace[]> {
  const response = await fetch("/api/reroute", {
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

  const result = await response.json();
  return result.traces as Trace[];
}
