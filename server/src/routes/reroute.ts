import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { validateRoutes } from "../lib/validateDesign.js";
import { routeDesign } from "../lib/autorouter/index.js";
import type { CircuitDesign } from "../../../src/types/circuit.js";

const router = Router();

// POST /api/reroute — grid-based A* autorouter for current layout
router.post("/", requireAuth, async (req, res) => {
  const { design } = req.body as { design: unknown };

  if (!design || typeof design !== "object") {
    res.status(400).json({ error: "design object is required" });
    return;
  }

  const d = design as {
    components: { ref: string; package: string; pins: { id: string; name: string; type: string }[]; pcbPosition: { x: number; y: number; rotation: number } }[];
    connections: { netName: string; pins: { ref: string; pin: string }[]; traceWidth?: number }[];
    board: { width: number; height: number; layers: number; cornerRadius: number };
    [key: string]: unknown;
  };

  if (!d.components || !d.connections || !d.board) {
    res.status(400).json({ error: "design must have components, connections, and board" });
    return;
  }

  try {
    const result = routeDesign(design as CircuitDesign);

    // Safety-net validation on autorouter output
    if (result.traces.length > 0) {
      const testDesign = { ...d, traces: result.traces };
      const issues = validateRoutes(testDesign);
      const errors = issues.filter(i => i.severity === "error");
      if (errors.length > 0) {
        console.log(`[reroute] Autorouter produced ${errors.length} validation errors`);
      }
    }

    console.log(`[reroute] Routed ${result.stats.routedNets}/${result.stats.totalNets} nets in ${result.stats.timeMs}ms`);

    res.json({
      traces: result.traces,
      failures: result.failures,
      stats: result.stats,
    });
  } catch (err) {
    console.error("[reroute] Error:", err);
    const message = err instanceof Error ? err.message : "Re-route failed";
    res.status(500).json({ error: message });
  }
});

export { router as rerouteRouter };
