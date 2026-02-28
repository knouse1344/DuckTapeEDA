# Footprint-Aware PCB Layout Engine — Design Document

**Date:** 2026-02-28
**Status:** Approved
**Approach:** AI-first (Approach A — Dimension-Enriched Prompting)

## Problem

DuckTape EDA's PCB component placement has no awareness of physical component sizes. The current overlap check is a naive center-to-center distance calculation (`< 1.5mm = warning`), which means:

- A tiny 0805 resistor and a large Arduino Nano can be placed 2mm apart and pass validation, despite physically overlapping
- Claude places components based on vague rules ("minimum 2mm spacing") with no knowledge of actual footprint dimensions
- The 3D view reveals overlapping components that would be unbuildable in reality

## Goals

1. **Phase 1 (this design):** Footprint-aware overlap prevention with real component dimensions
2. **Future phases:** Intelligent trace routing, DRC, layout optimization

## Architecture Decision

**AI-first:** Give Claude accurate footprint dimensions and spatial reasoning context in the prompt. Claude does intelligent placement. Code validates and rejects bad layouts via the existing retry loop. This fits the existing architecture naturally and keeps Claude as the "designer."

## Design

### 1. Footprint Dimension Data Model

Add a `Footprint` interface to `componentLibrary.ts`:

```typescript
export interface Footprint {
  width: number;    // mm — body width (x-axis when rotation=0)
  height: number;   // mm — body height (y-axis when rotation=0)
  keepout: number;  // mm — clearance zone around the body (pads, leads, soldering access)
}
```

Each `LibraryComponent` gets a `footprint` field. The total occupied rectangle is:
- `totalWidth = width + 2 * keepout`
- `totalHeight = height + 2 * keepout`

#### Built-in Dimension Table

| Package | width | height | keepout | Total footprint |
|---------|-------|--------|---------|-----------------|
| `Axial_TH` (resistor) | 9.0 | 3.0 | 1.5 | 12.0 x 6.0 |
| `Radial_TH` (capacitor) | 5.0 | 5.0 | 1.0 | 7.0 x 7.0 |
| `0805` (SMD R/C) | 2.0 | 1.25 | 0.5 | 3.0 x 2.25 |
| `5mm_TH` (LED) | 5.0 | 5.0 | 1.0 | 7.0 x 7.0 |
| `3mm_TH` (LED) | 3.0 | 3.0 | 1.0 | 5.0 x 5.0 |
| `USB_C` | 9.0 | 7.5 | 1.0 | 11.0 x 9.5 |
| `Barrel_Jack` | 14.0 | 9.0 | 1.0 | 16.0 x 11.0 |
| `JST_PH` (2-pin) | 6.0 | 6.0 | 1.0 | 8.0 x 8.0 |
| `JST_PH_3` (3-pin) | 8.0 | 6.0 | 1.0 | 10.0 x 8.0 |
| `PinHeader_1x_TH` | per-pin: 2.54 wide | 2.54 | 1.0 | (n*2.54+2.0) x 4.54 |
| `DIP28` (Arduino Nano) | 33.0 | 18.0 | 1.5 | 36.0 x 21.0 |
| `SSD1306_OLED` | 27.0 | 27.0 | 1.0 | 29.0 x 29.0 |
| `DHT22` | 15.0 | 20.0 | 1.5 | 18.0 x 23.0 |
| `DHT11` | 12.0 | 16.0 | 1.5 | 15.0 x 19.0 |
| `Buzzer_12mm` | 12.0 | 12.0 | 1.0 | 14.0 x 14.0 |
| `SOT-23` (MOSFET) | 3.0 | 1.4 | 0.5 | 4.0 x 2.4 |
| `SOT-223` (regulator) | 6.5 | 3.5 | 0.5 | 7.5 x 4.5 |
| `Tactile_6mm` (switch) | 6.0 | 6.0 | 1.0 | 8.0 x 8.0 |
| `LCD_1602` | 80.0 | 36.0 | 1.5 | 83.0 x 39.0 |

**AI fallback:** For components not in the table, Claude estimates dimensions based on the package type. The validator accepts AI-provided dimensions when no built-in data exists.

### 2. Enriched System Prompt

Three changes to `buildPrompt.ts`:

#### 2a. Library listing includes dimensions

The `formatLibraryForPrompt()` output adds footprint data:

```
RESISTOR — Through-hole Resistor (Axial_TH)
  Footprint: 9.0 x 3.0mm body, 1.5mm keepout → 12.0 x 6.0mm total
  Pins: 1 (passive), 2 (passive)
```

#### 2b. New placement rules

Replace the vague "minimum 2mm between components" with:

> **Footprint-aware placement:** Each component has a total footprint (body + keepout). When placing components, ensure their total footprints DO NOT overlap. The minimum gap between the edges of any two component footprints is 0.5mm. Calculate placement by checking that no two rectangles (considering rotation) intersect.

Add a concrete placement workflow:

> **Placement workflow:**
> 1. List all components and their total footprint dimensions
> 2. Place connectors at board edges first (they're anchored)
> 3. Place the largest non-connector component near board center
> 4. Place remaining components around it, checking each placement doesn't overlap any already-placed component
> 5. Size the board to fit all components with 2-3mm margin

#### 2c. Spatial reasoning context (retry only)

During validation retries, include a "placement map" showing occupied rectangles so Claude can see where free space exists. Not included on the first attempt to avoid prompt bloat.

### 3. Bounding-Box Collision Detection

Replace the naive distance check in `validateDesign.ts` (lines 361-375) with rotation-aware rectangle intersection testing:

#### 3a. Footprint lookup

New function `getComponentFootprint(comp)`:
1. Look up package in built-in footprint table
2. Fall back to defaults based on component type
3. Return `{ width, height, keepout }`

#### 3b. Bounding rectangle calculation

For each component, compute the occupied rectangle:
- `totalWidth = footprint.width + 2 * footprint.keepout`
- `totalHeight = footprint.height + 2 * footprint.keepout`
- When rotation is 90/270, swap width and height
- Compute axis-aligned bounding box centered on `pcbPosition`

#### 3c. Rectangle overlap test

```
overlapX = (a.left < b.right) && (a.right > b.left)
overlapY = (a.top < b.bottom) && (a.bottom > b.top)
overlap  = overlapX && overlapY
```

#### 3d. Severity levels

- **Overlapping footprints** (rectangles intersect) → **error** (must fix)
- **Tight clearance** (gap < 0.5mm but not overlapping) → **warning** (should fix)
- **Comfortable spacing** (gap >= 0.5mm) → pass

#### 3e. Actionable error messages

Each overlap error includes specific displacement:

> "R1 (12.0x6.0mm footprint) overlaps U1 (36.0x21.0mm footprint). R1 occupies [4.0,8.0]-[16.0,14.0], U1 occupies [5.0,3.0]-[41.0,24.0]. Move R1 at least 3.2mm to the right or 6.1mm upward to clear."

#### 3f. Board boundary check upgrade

Check the **entire rectangle** fits within the board (not just the center point):
- `comp.x - totalWidth/2 >= 0`
- `comp.x + totalWidth/2 <= board.width`
- `comp.y - totalHeight/2 >= 0`
- `comp.y + totalHeight/2 <= board.height`

Exception for connectors, which intentionally overhang the edge.

### 4. Enhanced Validation Feedback Loop

#### 4a. Spatial map in retry context

When overlap errors trigger a retry, include an ASCII placement map:

```
CURRENT BOARD STATE (50x35mm):
┌──────────────────────────────────────────────────┐
│                                                  │
│  ┌─U1──────────────────────┐                     │
│  │ Arduino Nano (36x21mm)  │  ┌─R1─────────┐    │
│  │                         │  │ OVERLAP!    │    │
│  │                    ┌────│──│─────┐       │    │
│  │                    │ DHT22 (18x23mm)     │    │
│  └────────────────────│────┘  └─────────────┘    │
│                       └─────────┘                │
│J1 (USB-C)                           BZ1 (Buzzer)│
└──────────────────────────────────────────────────┘

Free zones for R1: [(38,2)-(48,33)], [(2,23)-(36,33)]
```

#### 4b. Suggested fix coordinates

Each overlap error includes a concrete suggested position:

> "Move R1 to (42.0, 10.0) — this clears U1 by 2.5mm and stays within board bounds."

Computed by scanning for the nearest valid position that clears all existing components.

#### 4c. Retry budget

Stays at 2 retries. With specific feedback (exact coordinates, spatial map), one retry should fix most issues. Second retry handles cascading fixes.

#### 4d. Board auto-sizing suggestion

If components can't fit even with optimal placement (total footprint area > ~60% of board area), suggest a larger board:

> "Components require ~1,800mm² but the board is only 1,750mm² (50x35mm). Suggest increasing to 55x38mm."

### 5. Future Phases (not implemented now)

**Phase 2 — Intelligent Trace Routing:**
- A* pathfinding on a grid with component footprints as obstacles
- Two-layer awareness with vias
- Claude specifies net priority (critical vs. flexible)

**Phase 3 — Design Rule Checks (DRC):**
- Trace-to-trace clearance (min 0.2mm)
- Trace-to-pad clearance
- Minimum via size and annular ring
- Silkscreen-to-pad clearance

**Phase 4 — Layout Optimization:**
- Board utilization scoring
- Thermal grouping (power components away from heat-sensitive)
- Signal integrity hints
- Auto-suggest board size from component count

All future phases reuse the footprint dimension table and bounding-box geometry math from Phase 1.

## Files Affected

| File | Change |
|------|--------|
| `server/src/lib/componentLibrary.ts` | Add `Footprint` interface, footprint data to all components, update `formatLibraryForPrompt()` |
| `server/src/lib/validateDesign.ts` | Replace overlap check with bounding-box collision detection, add board boundary check, add spatial map generation, add suggested fix computation |
| `server/src/lib/buildPrompt.ts` | Update placement rules, add placement workflow, add spatial context for retries |
| `server/src/routes/chat.ts` | Pass spatial map into retry feedback |
| `src/types/circuit.ts` | No changes needed (footprint data lives in library, not in the design JSON) |