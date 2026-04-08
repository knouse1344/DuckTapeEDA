import type { CircuitDesign, Trace } from "../types/circuit";

export interface RouteFailure {
  net: string;
  from: string;
  to: string;
  reason: string;
}

export interface RouteStats {
  totalNets: number;
  routedNets: number;
  failedNets: number;
  timeMs: number;
}

export interface RerouteResult {
  traces: Trace[];
  failures: RouteFailure[];
  stats: RouteStats;
}

export async function rerouteTraces(
  token: string,
  design: CircuitDesign,
): Promise<RerouteResult> {
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
  return {
    traces: result.traces ?? [],
    failures: result.failures ?? [],
    stats: result.stats ?? { totalNets: 0, routedNets: 0, failedNets: 0, timeMs: 0 },
  };
}
