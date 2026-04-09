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

  // 6b. Connector-specific corridor carving for edge connectors.
  //     When connectors (USB-C, JST, etc.) sit at board edges, their pads land
  //     inside the KEEPOUT zone. The generic escape corridor (step 7) fails because
  //     the escape destination is still inside KEEPOUT. Fix: for each connector,
  //     carve a single wide corridor from the pad cluster toward the board interior
  //     (away from the nearest board edge), clearing KEEPOUT + BLOCKED_FRONT all
  //     the way past both the KEEPOUT zone AND the component's blocked body.
  //     The corridor is wide enough for all pads' traces to fan out simultaneously.
  const connectorComps = design.components.filter(c => c.type === "connector");
  const connectorRefs = new Set(connectorComps.map(c => c.ref));

  const maxTraceInflate = Math.ceil((TRACE_WIDTH_POWER / CELL_SIZE) / 2);
  // Width needed per trace channel: inflated trace (2*inflate+1) + 1 cell gap
  const channelWidth = 2 * maxTraceInflate + 1 + 1;

  for (const comp of connectorComps) {
    const fp = getFootprint(comp.package, comp.type, comp.value);
    const bounds = getComponentBounds(
      comp.pcbPosition.x,
      comp.pcbPosition.y,
      comp.pcbPosition.rotation,
      fp,
    );
    const cBounds = {
      gxMin: Math.max(0, toGridCoord(bounds.left, CELL_SIZE) - clearanceInflate),
      gxMax: Math.min(grid.cols - 1, toGridCoord(bounds.right, CELL_SIZE) + clearanceInflate),
      gyMin: Math.max(0, toGridCoord(bounds.top, CELL_SIZE) - clearanceInflate),
      gyMax: Math.min(grid.rows - 1, toGridCoord(bounds.bottom, CELL_SIZE) + clearanceInflate),
    };

    // Collect all pad grid positions for this connector
    const connPads: { gx: number; gy: number }[] = [];
    for (const pin of comp.pins) {
      const key = `${comp.ref}.${pin.id}`;
      const pos = padPositions.get(key);
      if (!pos) continue;
      connPads.push({ gx: toGridCoord(pos.x, CELL_SIZE), gy: toGridCoord(pos.y, CELL_SIZE) });
    }
    if (connPads.length === 0) continue;

    // Compute pad cluster center
    const padCenterX = Math.round(connPads.reduce((s, p) => s + p.gx, 0) / connPads.length);
    const padCenterY = Math.round(connPads.reduce((s, p) => s + p.gy, 0) / connPads.length);

    // Determine which board edge the connector is nearest to
    const distToLeft = padCenterX;
    const distToRight = grid.cols - 1 - padCenterX;
    const distToTop = padCenterY;
    const distToBottom = grid.rows - 1 - padCenterY;
    const minEdgeDist = Math.min(distToLeft, distToRight, distToTop, distToBottom);

    // Escape direction: toward the board center (away from the nearest edge)
    let dx = 0;
    let dy = 0;
    if (minEdgeDist === distToLeft) dx = 1;
    else if (minEdgeDist === distToRight) dx = -1;
    else if (minEdgeDist === distToTop) dy = 1;
    else dy = -1;

    // Compute corridor span perpendicular to escape direction.
    // Must span from the outermost pads plus enough room for all
    // traces to fan out with their inflate checks.
    const fanOutMargin = connPads.length * channelWidth;

    // Extra margin around the pad cluster so inflate checks at the
    // outermost pad positions don't bump into un-cleared cells.
    const inflateMargin = padInflate + maxTraceInflate;

    if (dx !== 0) {
      // Escape is horizontal (left/right edge connector)
      const padGyMin = Math.min(...connPads.map(p => p.gy));
      const padGyMax = Math.max(...connPads.map(p => p.gy));
      const corridorGyMin = Math.max(0, padGyMin - fanOutMargin);
      const corridorGyMax = Math.min(grid.rows - 1, padGyMax + fanOutMargin);

      // Corridor extends from behind the pads (inflateMargin before the
      // nearest pad) all the way past the component body + KEEPOUT.
      const padGxMin = Math.min(...connPads.map(p => p.gx));
      const padGxMax = Math.max(...connPads.map(p => p.gx));
      const bodyEnd = dx > 0
        ? cBounds.gxMax + maxTraceInflate + 2
        : cBounds.gxMin - maxTraceInflate - 2;
      const keepoutEnd = dx > 0
        ? marginCells + maxTraceInflate + 2
        : grid.cols - 1 - marginCells - maxTraceInflate - 2;
      const corridorGxEnd = dx > 0
        ? Math.min(grid.cols - 1, Math.max(bodyEnd, keepoutEnd))
        : Math.max(0, Math.min(bodyEnd, keepoutEnd));

      // Start the corridor from behind the pad cluster (opposite escape dir)
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
      // Escape is vertical (top/bottom edge connector)
      const padGxMin = Math.min(...connPads.map(p => p.gx));
      const padGxMax = Math.max(...connPads.map(p => p.gx));
      const corridorGxMin = Math.max(0, padGxMin - fanOutMargin);
      const corridorGxMax = Math.min(grid.cols - 1, padGxMax + fanOutMargin);

      const padGyMin = Math.min(...connPads.map(p => p.gy));
      const padGyMax = Math.max(...connPads.map(p => p.gy));
      const bodyEnd = dy > 0
        ? cBounds.gyMax + maxTraceInflate + 2
        : cBounds.gyMin - maxTraceInflate - 2;
      const keepoutEnd = dy > 0
        ? marginCells + maxTraceInflate + 2
        : grid.rows - 1 - marginCells - maxTraceInflate - 2;
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
