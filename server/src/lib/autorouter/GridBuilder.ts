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
  //     the escape destination is still inside KEEPOUT. Fix: for each connector pad,
  //     carve a corridor from the pad toward the board interior (away from the
  //     nearest board edge), clearing KEEPOUT + BLOCKED_FRONT all the way past the
  //     KEEPOUT zone so A* can reach the pad.
  const connectorRefs = new Set(
    design.components.filter(c => c.type === "connector").map(c => c.ref),
  );

  const maxTraceInflate = Math.ceil((TRACE_WIDTH_POWER / CELL_SIZE) / 2);
  const corridorHalf = padInflate + maxTraceInflate; // half-width of corridor

  for (const [key, pos] of padPositions) {
    const ref = key.split(".")[0];
    if (!connectorRefs.has(ref)) continue;

    const cx = toGridCoord(pos.x, CELL_SIZE);
    const cy = toGridCoord(pos.y, CELL_SIZE);

    // Determine which board edge is nearest to this pad
    const distToLeft = cx;
    const distToRight = grid.cols - 1 - cx;
    const distToTop = cy;
    const distToBottom = grid.rows - 1 - cy;
    const minEdgeDist = Math.min(distToLeft, distToRight, distToTop, distToBottom);

    // Escape direction: toward the board center (away from the nearest edge)
    let dx = 0;
    let dy = 0;
    if (minEdgeDist === distToLeft) dx = 1;        // nearest to left  → escape right
    else if (minEdgeDist === distToRight) dx = -1;  // nearest to right → escape left
    else if (minEdgeDist === distToTop) dy = 1;     // nearest to top   → escape down
    else dy = -1;                                    // nearest to bottom → escape up

    // Carve corridor from the pad outward past the KEEPOUT zone.
    // Endpoint: marginCells + corridorHalf + 1 cells from the edge, ensuring
    // the corridor exits fully past the KEEPOUT boundary.
    const corridorEnd = marginCells + corridorHalf + 1;

    if (dx !== 0) {
      // Horizontal corridor (escape left or right)
      const startX = cx;
      const endX = dx > 0
        ? Math.min(grid.cols - 1, corridorEnd)  // escaping rightward from left edge
        : Math.max(0, grid.cols - 1 - corridorEnd);  // escaping leftward from right edge
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
      // Vertical corridor (escape up or down)
      const startY = cy;
      const endY = dy > 0
        ? Math.min(grid.rows - 1, corridorEnd)  // escaping downward from top edge
        : Math.max(0, grid.rows - 1 - corridorEnd);  // escaping upward from bottom edge
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
  }

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
