import {
  type Grid,
  type GridPoint,
  CellFlag,
  CELL_SIZE,
  BOARD_MARGIN,
  TRACE_CLEARANCE,
  TRACE_WIDTH_POWER,
  createGrid,
  toGridCoord,
  setCell,
  clearCell,
  setNetId,
} from "./types.js";
import type { CircuitDesign } from "../../types/circuit.js";
import { getFootprint, getComponentBounds } from "../footprintTable.js";
import { computePadPositions } from "../padPositions.js";

export interface BuildGridResult {
  grid: Grid;
  netIndex: Map<string, number>;
  padPositions: Map<string, { x: number; y: number }>;
}

export function buildGrid(design: CircuitDesign): BuildGridResult {
  const board = design.board;
  const grid = createGrid(board.width, board.height, CELL_SIZE);

  // 1. Build net name → numeric ID lookup
  const netIndex = new Map<string, number>();
  design.connections.forEach((conn, i) => {
    netIndex.set(conn.netName, i);
  });

  // 2. Compute absolute pad positions
  const rawPads = computePadPositions(design.components as any);
  const padPositions = new Map<string, { x: number; y: number }>();
  for (const p of rawPads) {
    padPositions.set(`${p.ref}.${p.pinId}`, { x: p.x, y: p.y });
  }

  // 3. Build pin → netId lookup
  const pinToNet = new Map<string, number>();
  for (const conn of design.connections) {
    const netId = netIndex.get(conn.netName)!;
    for (const p of conn.pins) {
      pinToNet.set(`${p.ref}.${p.pin}`, netId);
    }
  }

  // 4. Stamp board edge KEEPOUT
  const marginCells = Math.ceil(BOARD_MARGIN / CELL_SIZE);
  for (let gy = 0; gy < grid.rows; gy++) {
    for (let gx = 0; gx < grid.cols; gx++) {
      if (
        gx < marginCells ||
        gx >= grid.cols - marginCells ||
        gy < marginCells ||
        gy >= grid.rows - marginCells
      ) {
        setCell(grid, gx, gy, CellFlag.KEEPOUT);
      }
    }
  }

  // 5. Stamp component footprints as BLOCKED_FRONT
  const clearanceInflate = Math.ceil(TRACE_CLEARANCE / CELL_SIZE);

  for (const comp of design.components) {
    const fp = getFootprint(comp.package, comp.type, comp.value);
    const bounds = getComponentBounds(
      comp.pcbPosition.x,
      comp.pcbPosition.y,
      comp.pcbPosition.rotation,
      fp,
    );

    const gxMin = Math.max(0, toGridCoord(bounds.left, CELL_SIZE) - clearanceInflate);
    const gxMax = Math.min(grid.cols - 1, toGridCoord(bounds.right, CELL_SIZE) + clearanceInflate);
    const gyMin = Math.max(0, toGridCoord(bounds.top, CELL_SIZE) - clearanceInflate);
    const gyMax = Math.min(grid.rows - 1, toGridCoord(bounds.bottom, CELL_SIZE) + clearanceInflate);

    for (let gy = gyMin; gy <= gyMax; gy++) {
      for (let gx = gxMin; gx <= gxMax; gx++) {
        setCell(grid, gx, gy, CellFlag.BLOCKED_FRONT);
      }
    }
  }

  // 6. Carve out pads
  const padInflate = Math.ceil(TRACE_CLEARANCE / CELL_SIZE);

  for (const [key, pos] of padPositions) {
    const netId = pinToNet.get(key) ?? -1;
    const cx = toGridCoord(pos.x, CELL_SIZE);
    const cy = toGridCoord(pos.y, CELL_SIZE);

    for (let dy = -padInflate; dy <= padInflate; dy++) {
      for (let dx = -padInflate; dx <= padInflate; dx++) {
        const gx = cx + dx;
        const gy = cy + dy;
        if (gx < 0 || gx >= grid.cols || gy < 0 || gy >= grid.rows) continue;

        clearCell(grid, gx, gy, CellFlag.BLOCKED_FRONT);
        clearCell(grid, gx, gy, CellFlag.KEEPOUT);
        setCell(grid, gx, gy, CellFlag.PAD);
        if (netId >= 0) {
          setNetId(grid, gx, gy, netId);
        }
      }
    }
  }

  // 6b. Connector corridor carving — unified per edge.
  //     When connectors (USB-C, JST, etc.) sit at board edges, their pads land
  //     inside the KEEPOUT zone. The generic escape corridor (step 7) fails because
  //     the escape destination is still inside KEEPOUT. Fix: group connectors by
  //     their nearest board edge and carve a SINGLE unified corridor per edge that
  //     spans from the minimum to maximum pad position across ALL connectors on
  //     that edge. This ensures the gap between two connectors on the same edge
  //     is also cleared, allowing the router to route nets between them.
  const connectorComps = design.components.filter(c => c.type === "connector");
  const connectorRefs = new Set(connectorComps.map(c => c.ref));

  const maxTraceInflate = Math.ceil((TRACE_WIDTH_POWER / CELL_SIZE) / 2);
  // Width needed per trace channel: inflated trace (2*inflate+1) + 1 cell gap
  const channelWidth = 2 * maxTraceInflate + 1 + 1;

  // Group connectors by nearest board edge
  type Edge = "left" | "right" | "top" | "bottom";
  const edgeGroups = new Map<Edge, typeof connectorComps>();

  for (const comp of connectorComps) {
    // Collect pad positions for this connector to find its pad center
    const compPads: { gx: number; gy: number }[] = [];
    for (const pin of comp.pins) {
      const key = `${comp.ref}.${pin.id}`;
      const pos = padPositions.get(key);
      if (!pos) continue;
      compPads.push({ gx: toGridCoord(pos.x, CELL_SIZE), gy: toGridCoord(pos.y, CELL_SIZE) });
    }
    if (compPads.length === 0) continue;

    const padCenterX = Math.round(compPads.reduce((s, p) => s + p.gx, 0) / compPads.length);
    const padCenterY = Math.round(compPads.reduce((s, p) => s + p.gy, 0) / compPads.length);

    const distToLeft = padCenterX;
    const distToRight = grid.cols - 1 - padCenterX;
    const distToTop = padCenterY;
    const distToBottom = grid.rows - 1 - padCenterY;
    const minEdgeDist = Math.min(distToLeft, distToRight, distToTop, distToBottom);

    let edge: Edge;
    if (minEdgeDist === distToLeft) edge = "left";
    else if (minEdgeDist === distToRight) edge = "right";
    else if (minEdgeDist === distToTop) edge = "top";
    else edge = "bottom";

    if (!edgeGroups.has(edge)) edgeGroups.set(edge, []);
    edgeGroups.get(edge)!.push(comp);
  }

  // For each edge group, collect ALL pads and component bounds, then carve one unified corridor
  for (const [edge, comps] of edgeGroups) {
    // Collect all pads from all connectors in this edge group
    const allPads: { gx: number; gy: number }[] = [];
    // Collect all component bounds
    let unifiedBodyGxMin = Infinity;
    let unifiedBodyGxMax = -Infinity;
    let unifiedBodyGyMin = Infinity;
    let unifiedBodyGyMax = -Infinity;

    for (const comp of comps) {
      const fp = getFootprint(comp.package, comp.type, comp.value);
      const bounds = getComponentBounds(
        comp.pcbPosition.x,
        comp.pcbPosition.y,
        comp.pcbPosition.rotation,
        fp,
      );
      unifiedBodyGxMin = Math.min(unifiedBodyGxMin, Math.max(0, toGridCoord(bounds.left, CELL_SIZE) - clearanceInflate));
      unifiedBodyGxMax = Math.max(unifiedBodyGxMax, Math.min(grid.cols - 1, toGridCoord(bounds.right, CELL_SIZE) + clearanceInflate));
      unifiedBodyGyMin = Math.min(unifiedBodyGyMin, Math.max(0, toGridCoord(bounds.top, CELL_SIZE) - clearanceInflate));
      unifiedBodyGyMax = Math.max(unifiedBodyGyMax, Math.min(grid.rows - 1, toGridCoord(bounds.bottom, CELL_SIZE) + clearanceInflate));

      for (const pin of comp.pins) {
        const key = `${comp.ref}.${pin.id}`;
        const pos = padPositions.get(key);
        if (!pos) continue;
        allPads.push({ gx: toGridCoord(pos.x, CELL_SIZE), gy: toGridCoord(pos.y, CELL_SIZE) });
      }
    }
    if (allPads.length === 0) continue;

    // Compute fan-out margin based on TOTAL pad count across all connectors on this edge
    const fanOutMargin = allPads.length * channelWidth;
    const inflateMargin = padInflate + maxTraceInflate;

    // Escape direction: toward board center (away from the nearest edge)
    const dx = edge === "left" ? 1 : edge === "right" ? -1 : 0;
    const dy = edge === "top" ? 1 : edge === "bottom" ? -1 : 0;

    if (dx !== 0) {
      // Escape is horizontal (left/right edge connector group)
      const padGyMin = Math.min(...allPads.map(p => p.gy));
      const padGyMax = Math.max(...allPads.map(p => p.gy));
      // Ensure minimum corridor width for all traces to fit side-by-side
      const minCorridorHalfY = Math.ceil(((allPads.length + 1) * channelWidth) / 2);
      const actualFanOutY = Math.max(fanOutMargin, minCorridorHalfY);
      const corridorGyMin = Math.max(0, padGyMin - actualFanOutY);
      const corridorGyMax = Math.min(grid.rows - 1, padGyMax + actualFanOutY);

      const padGxMin = Math.min(...allPads.map(p => p.gx));
      const padGxMax = Math.max(...allPads.map(p => p.gx));
      const bodyEnd = dx > 0
        ? unifiedBodyGxMax + maxTraceInflate + 2
        : unifiedBodyGxMin - maxTraceInflate - 2;
      // Extend corridor deeper into board so traces can fan out
      const fanDepthX = Math.max(maxTraceInflate + 2, Math.ceil(fanOutMargin / 2));
      const keepoutEnd = dx > 0
        ? marginCells + fanDepthX
        : grid.cols - 1 - marginCells - fanDepthX;
      const corridorGxEnd = dx > 0
        ? Math.min(grid.cols - 1, Math.max(bodyEnd, keepoutEnd))
        : Math.max(0, Math.min(bodyEnd, keepoutEnd));

      const corridorGxStart = dx > 0
        ? Math.max(0, padGxMin - inflateMargin)
        : Math.min(grid.cols - 1, padGxMax + inflateMargin);

      const lo = Math.min(corridorGxStart, corridorGxEnd);
      const hi = Math.max(corridorGxStart, corridorGxEnd);

      for (let gx = lo; gx <= hi; gx++) {
        for (let gy = corridorGyMin; gy <= corridorGyMax; gy++) {
          if (gx < 0 || gx >= grid.cols || gy < 0 || gy >= grid.rows) continue;
          clearCell(grid, gx, gy, CellFlag.BLOCKED_FRONT);
          clearCell(grid, gx, gy, CellFlag.KEEPOUT);
        }
      }
    } else {
      // Escape is vertical (top/bottom edge connector group)
      const padGxMin = Math.min(...allPads.map(p => p.gx));
      const padGxMax = Math.max(...allPads.map(p => p.gx));
      // Ensure minimum corridor width for all traces to fit side-by-side
      const minCorridorHalfX = Math.ceil(((allPads.length + 1) * channelWidth) / 2);
      const actualFanOutX = Math.max(fanOutMargin, minCorridorHalfX);
      const corridorGxMin = Math.max(0, padGxMin - actualFanOutX);
      const corridorGxMax = Math.min(grid.cols - 1, padGxMax + actualFanOutX);

      const padGyMin = Math.min(...allPads.map(p => p.gy));
      const padGyMax = Math.max(...allPads.map(p => p.gy));
      const bodyEnd = dy > 0
        ? unifiedBodyGyMax + maxTraceInflate + 2
        : unifiedBodyGyMin - maxTraceInflate - 2;
      // Extend corridor deeper into board so traces can fan out
      const fanDepthY = Math.max(maxTraceInflate + 2, Math.ceil(fanOutMargin / 2));
      const keepoutEnd = dy > 0
        ? marginCells + fanDepthY
        : grid.rows - 1 - marginCells - fanDepthY;
      const corridorGyEnd = dy > 0
        ? Math.min(grid.rows - 1, Math.max(bodyEnd, keepoutEnd))
        : Math.max(0, Math.min(bodyEnd, keepoutEnd));

      const corridorGyStart = dy > 0
        ? Math.max(0, padGyMin - inflateMargin)
        : Math.min(grid.rows - 1, padGyMax + inflateMargin);

      const lo = Math.min(corridorGyStart, corridorGyEnd);
      const hi = Math.max(corridorGyStart, corridorGyEnd);

      for (let gy = lo; gy <= hi; gy++) {
        for (let gx = corridorGxMin; gx <= corridorGxMax; gx++) {
          if (gx < 0 || gx >= grid.cols || gy < 0 || gy >= grid.rows) continue;
          clearCell(grid, gx, gy, CellFlag.BLOCKED_FRONT);
          clearCell(grid, gx, gy, CellFlag.KEEPOUT);
        }
      }
    }
  }

  // Corridor half-width for generic (non-connector) escape corridors.
  const corridorHalf = padInflate + 2 * maxTraceInflate + 1;

  // 7. Carve escape corridors from each pad to outside the component body.
  //    Without this, pads deep inside a component's blocked zone are unreachable.
  //    For each pad, find the shortest cardinal direction to unblocked space and
  //    carve a corridor wide enough for the widest trace (power net inflate) to pass.
  //    (Connectors are handled by step 6b above — skip them here.)
  for (const comp of design.components) {
    if (connectorRefs.has(comp.ref)) continue;
    const fp = getFootprint(comp.package, comp.type, comp.value);
    const bounds = getComponentBounds(
      comp.pcbPosition.x,
      comp.pcbPosition.y,
      comp.pcbPosition.rotation,
      fp,
    );

    const gxMin = Math.max(0, toGridCoord(bounds.left, CELL_SIZE) - clearanceInflate);
    const gxMax = Math.min(grid.cols - 1, toGridCoord(bounds.right, CELL_SIZE) + clearanceInflate);
    const gyMin = Math.max(0, toGridCoord(bounds.top, CELL_SIZE) - clearanceInflate);
    const gyMax = Math.min(grid.rows - 1, toGridCoord(bounds.bottom, CELL_SIZE) + clearanceInflate);

    // Find pads belonging to this component
    for (const pin of comp.pins) {
      const key = `${comp.ref}.${pin.id}`;
      const pos = padPositions.get(key);
      if (!pos) continue;

      const cx = toGridCoord(pos.x, CELL_SIZE);
      const cy = toGridCoord(pos.y, CELL_SIZE);

      // Distances to each edge of the blocked zone (in grid cells)
      const distLeft = cx - gxMin;
      const distRight = gxMax - cx;
      const distUp = cy - gyMin;
      const distDown = gyMax - cy;

      // Rank escape directions by distance (shortest first),
      // but skip directions that exit into KEEPOUT or off-board.
      const dirs: { axis: "h" | "v"; sign: -1 | 1; dist: number }[] = [
        { axis: "h", sign: -1, dist: distLeft },
        { axis: "h", sign:  1, dist: distRight },
        { axis: "v", sign: -1, dist: distUp },
        { axis: "v", sign:  1, dist: distDown },
      ];
      dirs.sort((a, b) => a.dist - b.dist);

      const marginCells2 = Math.ceil(BOARD_MARGIN / CELL_SIZE);

      let carved = false;
      for (const dir of dirs) {
        if (dir.dist <= 0) continue; // already at edge
        // Check that the escape destination is within usable board area
        let escapeOk = true;
        if (dir.axis === "h") {
          const destX = dir.sign < 0 ? gxMin - 1 : gxMax + 1;
          if (destX < marginCells2 || destX >= grid.cols - marginCells2) escapeOk = false;
        } else {
          const destY = dir.sign < 0 ? gyMin - 1 : gyMax + 1;
          if (destY < marginCells2 || destY >= grid.rows - marginCells2) escapeOk = false;
        }
        if (!escapeOk) continue;

        // Carve corridor in chosen direction, wide enough for inflated traces
        if (dir.axis === "h") {
          const startX = dir.sign < 0 ? gxMin - 1 : cx + padInflate;
          const endX = dir.sign < 0 ? cx - padInflate : gxMax + 1;
          const lo = Math.min(startX, endX);
          const hi = Math.max(startX, endX);
          for (let gx = lo; gx <= hi; gx++) {
            for (let d = -corridorHalf; d <= corridorHalf; d++) {
              const gy = cy + d;
              if (gx < 0 || gx >= grid.cols || gy < 0 || gy >= grid.rows) continue;
              clearCell(grid, gx, gy, CellFlag.BLOCKED_FRONT);
              clearCell(grid, gx, gy, CellFlag.KEEPOUT);
            }
          }
        } else {
          const startY = dir.sign < 0 ? gyMin - 1 : cy + padInflate;
          const endY = dir.sign < 0 ? cy - padInflate : gyMax + 1;
          const lo = Math.min(startY, endY);
          const hi = Math.max(startY, endY);
          for (let gy = lo; gy <= hi; gy++) {
            for (let d = -corridorHalf; d <= corridorHalf; d++) {
              const gx = cx + d;
              if (gx < 0 || gx >= grid.cols || gy < 0 || gy >= grid.rows) continue;
              clearCell(grid, gx, gy, CellFlag.BLOCKED_FRONT);
              clearCell(grid, gx, gy, CellFlag.KEEPOUT);
            }
          }
        }

        carved = true;
        break;
      }
    }
  }

  return { grid, netIndex, padPositions };
}

export function stampTrace(
  grid: Grid,
  path: GridPoint[],
  netId: number,
  inflate: number,
): void {
  for (const pt of path) {
    for (let dy = -inflate; dy <= inflate; dy++) {
      for (let dx = -inflate; dx <= inflate; dx++) {
        const gx = pt.x + dx;
        const gy = pt.y + dy;
        if (gx < 0 || gx >= grid.cols || gy < 0 || gy >= grid.rows) continue;
        setCell(grid, gx, gy, CellFlag.TRACE_FRONT);
        setNetId(grid, gx, gy, netId);
      }
    }
  }
}
