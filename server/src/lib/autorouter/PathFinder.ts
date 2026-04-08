import {
  type Grid,
  type GridPoint,
  type PathResult,
  CellFlag,
  MOVE_COST_ORTHO,
  MOVE_COST_DIAG,
  hasFlag,
  getNetId,
} from "./types.js";

const DIRS: { dx: number; dy: number; cost: number }[] = [
  { dx:  1, dy:  0, cost: MOVE_COST_ORTHO },
  { dx: -1, dy:  0, cost: MOVE_COST_ORTHO },
  { dx:  0, dy:  1, cost: MOVE_COST_ORTHO },
  { dx:  0, dy: -1, cost: MOVE_COST_ORTHO },
  { dx:  1, dy:  1, cost: MOVE_COST_DIAG  },
  { dx: -1, dy:  1, cost: MOVE_COST_DIAG  },
  { dx:  1, dy: -1, cost: MOVE_COST_DIAG  },
  { dx: -1, dy: -1, cost: MOVE_COST_DIAG  },
];

/** Octile distance heuristic — admissible for 8-directional movement */
function heuristic(ax: number, ay: number, bx: number, by: number): number {
  const dx = Math.abs(bx - ax);
  const dy = Math.abs(by - ay);
  return Math.max(dx, dy) + 0.414 * Math.min(dx, dy);
}

/**
 * Check if a single cell is passable for the given net.
 *
 * Passability rules:
 *  - Out of bounds → impassable
 *  - KEEPOUT flag → impassable
 *  - BLOCKED_FRONT flag → impassable
 *  - TRACE_FRONT with a different net → impassable
 *  - netMap owned by a different net → impassable
 *  - Everything else (including cells owned by the same net) → passable
 */
function isPassable(grid: Grid, gx: number, gy: number, netId: number): boolean {
  if (gx < 0 || gx >= grid.cols || gy < 0 || gy >= grid.rows) return false;
  const flags = grid.cells[gy * grid.cols + gx];
  if (flags & CellFlag.KEEPOUT) return false;
  if (flags & CellFlag.BLOCKED_FRONT) return false;
  if (flags & CellFlag.TRACE_FRONT) {
    const cellNet = grid.netMap[gy * grid.cols + gx];
    if (cellNet !== -1 && cellNet !== netId) return false;
  }
  const cellNet = grid.netMap[gy * grid.cols + gx];
  if (cellNet !== -1 && cellNet !== netId) return false;
  return true;
}

/**
 * Check passability with trace-width inflation.
 * For inflate=0, only the center cell is checked.
 * For inflate>0, a (2*inflate+1) square around the cell must all be passable.
 */
function isPassableInflated(
  grid: Grid,
  gx: number,
  gy: number,
  netId: number,
  inflate: number,
): boolean {
  for (let dy = -inflate; dy <= inflate; dy++) {
    for (let dx = -inflate; dx <= inflate; dx++) {
      if (!isPassable(grid, gx + dx, gy + dy, netId)) return false;
    }
  }
  return true;
}

/* ── Binary min-heap keyed on f-score ──────────────────────────── */
class MinHeap {
  private data: { x: number; y: number; f: number }[] = [];

  get size(): number {
    return this.data.length;
  }

  push(node: { x: number; y: number; f: number }): void {
    this.data.push(node);
    this.bubbleUp(this.data.length - 1);
  }

  pop(): { x: number; y: number; f: number } | undefined {
    const top = this.data[0];
    const last = this.data.pop();
    if (this.data.length > 0 && last) {
      this.data[0] = last;
      this.sinkDown(0);
    }
    return top;
  }

  private bubbleUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.data[i].f >= this.data[parent].f) break;
      [this.data[i], this.data[parent]] = [this.data[parent], this.data[i]];
      i = parent;
    }
  }

  private sinkDown(i: number): void {
    const len = this.data.length;
    while (true) {
      let smallest = i;
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      if (left < len && this.data[left].f < this.data[smallest].f)
        smallest = left;
      if (right < len && this.data[right].f < this.data[smallest].f)
        smallest = right;
      if (smallest === i) break;
      [this.data[i], this.data[smallest]] = [this.data[smallest], this.data[i]];
      i = smallest;
    }
  }
}

/* ── A* path finder ────────────────────────────────────────────── */

/**
 * Find the shortest path between two grid points using A* with octile heuristic.
 *
 * @param grid    - The routing grid
 * @param start   - Source grid coordinate
 * @param end     - Target grid coordinate
 * @param netId   - Net ID for passability checks (cells owned by this net are traversable)
 * @param inflate - Trace-width inflation radius in cells (0 = single cell, 1 = 3x3 check, etc.)
 * @returns PathResult with found flag, path (start to end), and total cost
 */
export function findPath(
  grid: Grid,
  start: GridPoint,
  end: GridPoint,
  netId: number,
  inflate: number,
): PathResult {
  const { cols, rows } = grid;
  const total = cols * rows;

  const gScore = new Float32Array(total);
  gScore.fill(Infinity);

  const cameFrom = new Int32Array(total);
  cameFrom.fill(-1);

  const closed = new Uint8Array(total);

  const startIdx = start.y * cols + start.x;
  const endIdx = end.y * cols + end.x;

  gScore[startIdx] = 0;

  const open = new MinHeap();
  open.push({
    x: start.x,
    y: start.y,
    f: heuristic(start.x, start.y, end.x, end.y),
  });

  while (open.size > 0) {
    const current = open.pop()!;
    const ci = current.y * cols + current.x;

    if (ci === endIdx) {
      // Reconstruct path from end to start via cameFrom links
      const path: GridPoint[] = [];
      let idx = endIdx;
      while (idx !== -1) {
        path.push({ x: idx % cols, y: Math.floor(idx / cols) });
        idx = cameFrom[idx];
      }
      path.reverse();
      return { found: true, path, cost: gScore[endIdx] };
    }

    if (closed[ci]) continue;
    closed[ci] = 1;

    for (const dir of DIRS) {
      const nx = current.x + dir.dx;
      const ny = current.y + dir.dy;
      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;

      const ni = ny * cols + nx;
      if (closed[ni]) continue;

      if (!isPassableInflated(grid, nx, ny, netId, inflate)) continue;

      const tentativeG = gScore[ci] + dir.cost;
      if (tentativeG < gScore[ni]) {
        gScore[ni] = tentativeG;
        cameFrom[ni] = ci;
        open.push({
          x: nx,
          y: ny,
          f: tentativeG + heuristic(nx, ny, end.x, end.y),
        });
      }
    }
  }

  return { found: false, path: [], cost: Infinity };
}
