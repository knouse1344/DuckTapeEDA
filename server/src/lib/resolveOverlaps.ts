/**
 * Server-side overlap resolver for PCB layout.
 *
 * LLMs can't reliably do spatial bin-packing, so this module takes
 * AI-generated component positions and fixes overlaps deterministically
 * using a greedy largest-first placement with spiral search fallback.
 */

import { getFootprint, getComponentBounds, rectanglesOverlap } from "./footprintTable.js";
import type { FootprintDimensions } from "./footprintTable.js";

/* ------------------------------------------------------------------ */
/*  Public types                                                       */
/* ------------------------------------------------------------------ */

interface DesignComponent {
  ref: string;
  type: string;
  package: string;
  value?: string;
  pcbPosition: { x: number; y: number; rotation: number };
}

interface DesignToResolve {
  components: DesignComponent[];
  board: { width: number; height: number };
}

interface CompInfo {
  comp: DesignComponent;
  footprint: FootprintDimensions;
  area: number;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const STEP = 2.0;          // spiral search step size in mm
const MIN_GAP = 0.5;       // minimum gap between components in mm
const BOARD_MARGIN = 2.0;  // board-edge margin in mm

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

type Rect = { left: number; top: number; right: number; bottom: number };

/** Inflate a rectangle on every side by `gap` mm. */
function inflateRect(r: Rect, gap: number): Rect {
  return {
    left: r.left - gap,
    top: r.top - gap,
    right: r.right + gap,
    bottom: r.bottom + gap,
  };
}

/** Round a number to 0.1 mm precision. */
function roundTo01(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Check whether placing a component at (x, y) would overlap any
 * already-placed rectangle, respecting MIN_GAP padding.
 */
function overlapsAny(
  x: number,
  y: number,
  rotation: number,
  footprint: FootprintDimensions,
  placed: Rect[],
): boolean {
  const candidate = getComponentBounds(x, y, rotation, footprint);
  const padded = inflateRect(candidate, MIN_GAP);
  for (const rect of placed) {
    if (rectanglesOverlap(padded, rect)) return true;
  }
  return false;
}

/**
 * Spiral search outward from (cx, cy) to find the nearest clear position.
 *
 * At each radius r, we test evenly-spaced points around the circumference.
 * Negative positions (x < 0 or y < 0) are skipped because PCB coordinates
 * should stay in the positive quadrant.
 */
function findClearPosition(
  cx: number,
  cy: number,
  rotation: number,
  footprint: FootprintDimensions,
  placed: Rect[],
  maxDim: number,
): { x: number; y: number } | null {
  const maxRadius = 2 * maxDim;

  for (let r = STEP; r <= maxRadius; r += STEP) {
    const circumference = 2 * Math.PI * r;
    const numPoints = Math.max(8, Math.ceil(circumference / STEP));

    for (let i = 0; i < numPoints; i++) {
      const angle = (2 * Math.PI * i) / numPoints;
      const tx = cx + r * Math.cos(angle);
      const ty = cy + r * Math.sin(angle);

      // Stay in the positive quadrant
      if (tx < 0 || ty < 0) continue;

      if (!overlapsAny(tx, ty, rotation, footprint, placed)) {
        return { x: roundTo01(tx), y: roundTo01(ty) };
      }
    }
  }

  return null; // exhausted
}

/* ------------------------------------------------------------------ */
/*  Main entry point                                                   */
/* ------------------------------------------------------------------ */

/**
 * Resolve overlapping component positions in a PCB design.
 *
 * Mutates `design.components[].pcbPosition` and `design.board` in place.
 * Returns `true` if any positions (or the board size) were changed.
 */
export function resolveOverlaps(design: DesignToResolve): boolean {
  let changed = false;

  // 1. Filter to components that have valid numeric pcbPosition
  const valid = design.components.filter(
    (c) =>
      c.pcbPosition &&
      typeof c.pcbPosition.x === "number" &&
      typeof c.pcbPosition.y === "number" &&
      !Number.isNaN(c.pcbPosition.x) &&
      !Number.isNaN(c.pcbPosition.y),
  );

  if (valid.length === 0) return false;

  // 2. Build footprint info for each component
  const infos: CompInfo[] = valid.map((comp) => {
    const fp = getFootprint(comp.package, comp.type, comp.value);
    return { comp, footprint: fp, area: fp.width * fp.height };
  });

  // 3. Sort by footprint area descending (largest first)
  infos.sort((a, b) => b.area - a.area);

  // 4. Greedy placement
  const placed: Rect[] = [];
  const maxDim = Math.max(design.board.width, design.board.height);

  for (const info of infos) {
    const { comp, footprint } = info;
    const pos = comp.pcbPosition;

    const currentBounds = getComponentBounds(pos.x, pos.y, pos.rotation, footprint);
    const paddedBounds = inflateRect(currentBounds, MIN_GAP);

    // Check overlap against all already-placed components
    let hasOverlap = false;
    for (const rect of placed) {
      if (rectanglesOverlap(paddedBounds, rect)) {
        hasOverlap = true;
        break;
      }
    }

    if (hasOverlap) {
      // Spiral search for a clear position
      const clear = findClearPosition(
        pos.x,
        pos.y,
        pos.rotation,
        footprint,
        placed,
        maxDim,
      );

      if (clear) {
        pos.x = clear.x;
        pos.y = clear.y;
      } else {
        // Fallback: place far to the right of all existing components
        let maxRight = 0;
        for (const rect of placed) {
          if (rect.right > maxRight) maxRight = rect.right;
        }
        pos.x = roundTo01(maxRight + MIN_GAP + (footprint.width / 2) + footprint.keepout);
        pos.y = roundTo01(footprint.height / 2 + footprint.keepout + BOARD_MARGIN);
      }

      changed = true;
    }

    // Record the final bounds of this component (no padding — raw bounds)
    placed.push(getComponentBounds(pos.x, pos.y, pos.rotation, footprint));
  }

  // 5. Board boundary adjustments
  for (const info of infos) {
    const { comp, footprint } = info;
    const pos = comp.pcbPosition;
    const bounds = getComponentBounds(pos.x, pos.y, pos.rotation, footprint);

    // Shift components that extend into negative / too-close-to-edge territory
    if (bounds.left < BOARD_MARGIN) {
      pos.x += BOARD_MARGIN - bounds.left;
      changed = true;
    }
    if (bounds.top < BOARD_MARGIN) {
      pos.y += BOARD_MARGIN - bounds.top;
      changed = true;
    }

    // Recompute after potential shift
    const adjusted = getComponentBounds(pos.x, pos.y, pos.rotation, footprint);

    // Grow board if component extends past edges
    if (adjusted.right + BOARD_MARGIN > design.board.width) {
      design.board.width = roundTo01(adjusted.right + BOARD_MARGIN);
      changed = true;
    }
    if (adjusted.bottom + BOARD_MARGIN > design.board.height) {
      design.board.height = roundTo01(adjusted.bottom + BOARD_MARGIN);
      changed = true;
    }
  }

  // 6. Re-check overlaps after board margin shifts
  //    Boundary adjustments in step 5 may have pushed components into each other.
  //    Rebuild the placed list and resolve any newly-introduced conflicts.
  if (changed) {
    const postPlaced: Rect[] = [];

    for (const info of infos) {
      const { comp, footprint } = info;
      const pos = comp.pcbPosition;

      const currentBounds = getComponentBounds(pos.x, pos.y, pos.rotation, footprint);
      const paddedBounds = inflateRect(currentBounds, MIN_GAP);

      let hasOverlap = false;
      for (const rect of postPlaced) {
        if (rectanglesOverlap(paddedBounds, rect)) {
          hasOverlap = true;
          break;
        }
      }

      if (hasOverlap) {
        const clear = findClearPosition(
          pos.x,
          pos.y,
          pos.rotation,
          footprint,
          postPlaced,
          Math.max(design.board.width, design.board.height),
        );

        if (clear) {
          pos.x = clear.x;
          pos.y = clear.y;
        } else {
          let maxRight = 0;
          for (const rect of postPlaced) {
            if (rect.right > maxRight) maxRight = rect.right;
          }
          pos.x = roundTo01(maxRight + MIN_GAP + (footprint.width / 2) + footprint.keepout);
          pos.y = roundTo01(footprint.height / 2 + footprint.keepout + BOARD_MARGIN);
        }
      }

      postPlaced.push(getComponentBounds(pos.x, pos.y, pos.rotation, footprint));
    }
  }

  return changed;
}
