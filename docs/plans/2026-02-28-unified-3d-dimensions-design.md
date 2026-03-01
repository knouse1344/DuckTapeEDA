# Unified 3D Dimensions — Design Document

## Problem

The PCB layout editor and 3D renderer use different dimension sources. The PCB editor reads from `footprintLookup.ts` while each 3D builder in `buildScene.ts` hardcodes its own sizes. This causes two bugs:

1. **Orientation mismatch**: Arduino Nano shows as landscape (43x18mm) in PCB but portrait (18x45mm) in 3D because the axis conventions are swapped.
2. **Size mismatch**: HC-SR04 shows as 45x20mm in PCB but ~15x6mm in 3D because there's no dedicated builder and the generic fallback computes dimensions from pin count.

Same issue affects LCD 1602 and Pi Pico (axes swapped in 3D).

## Solution

Make the 3D builders read from the same footprint table the PCB editor uses. The footprint table becomes the single source of truth for component dimensions. 3D builders add visual details (chips, pins, USB ports) on top of the correctly-sized base.

## Axis Convention

Standardized across both systems:

- `width` = X axis (left-right when viewed from above)
- `height` = Z axis (front-back when viewed from above)
- For dev boards, `width` is the long axis (pin-header direction)

Mapping in each system:

| Dimension | PCB Editor (SVG) | 3D Renderer (Three.js) |
|-----------|-------------------|------------------------|
| width     | SVG x             | pcbW (X axis)          |
| height    | SVG y             | pcbD (Z axis)          |

## Data Flow

```
footprintLookup.ts  (single source of truth)
       |
       +---> PcbLayoutEditor.tsx  (reads width/height for SVG rectangles)
       |
       +---> buildScene.ts        (reads width/height for 3D PCB base)
                                   (adds visual details on top)
```

## Changes

### 1. Dedicated 3D Builders

Each dedicated builder (`buildArduinoNano`, `buildLCDModule`, `buildPiPico`, `buildOLEDModule`, `buildDHT22`, `buildWS2812B`, `buildBuzzer`):

- Add `getFootprint(comp.package, comp.type, comp.value)` call at the top
- Set `pcbW = fp.width`, `pcbD = fp.height`
- Remove hardcoded dimension constants
- Reposition visual details relative to new base dimensions

**DHT22 exception**: Vertical sensor (tall box, not a flat PCB). The 3D builder keeps its own body dimensions for the visual model. The footprint table value (15x20mm) correctly represents the board footprint.

### 2. Generic Fallback Builder

`buildGenericModule()` currently computes dimensions from pin count (~15x6mm for 4 pins). Change to:

- Call `getFootprint()` to get correct dimensions
- Use those for the PCB base rectangle
- Adjust pin header layout to fit actual PCB size

Same for the generic black box fallback in `buildGenericIC()`.

This automatically fixes HC-SR04 and any future component without a dedicated builder.

### 3. Footprint Table Audit

Verify values against real datasheets:

| Component | Current (w x h) | Real Datasheet | Action |
|-----------|------------------|----------------|--------|
| Arduino Nano | 43 x 18 | ~45 x 18mm | Check and fix if needed |
| LCD 1602 | 80 x 36 | 80 x 36mm | Correct |
| Pi Pico | 51 x 21 | 51 x 21mm | Correct |
| HC-SR04 | 45 x 20 | 45 x 20mm | Correct |

### 4. Files Changed

- **`src/components/threed/buildScene.ts`** — Primary change. All builders read from footprint table.
- **`src/lib/footprintLookup.ts`** — Minor value corrections from audit (if any).

### Files NOT Changed

- `server/src/lib/footprintTable.ts` — Independent server deployment, stays as-is
- `src/components/PcbLayoutEditor.tsx` — Already reads from footprintLookup, no changes
- `src/App.tsx` — No changes

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Source of truth | footprintLookup.ts | Already exists with correct values, used by PCB editor |
| Width convention | Long axis for dev boards | Matches how boards are typically oriented |
| DHT22 handling | Exception — keeps own 3D body dims | Vertical sensor doesn't map to flat PCB rectangle |
| Generic fallback | Read from footprint table | Fixes HC-SR04 and all future components automatically |
| Server footprint table | Leave independent | Different deployment, already aligned on values |
