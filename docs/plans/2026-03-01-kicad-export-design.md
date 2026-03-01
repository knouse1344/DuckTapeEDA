# KiCad & Manufacturing Export — Design Document

## Problem

DuckTape EDA can design and validate PCBs but has zero export capability. The "Download KiCad" and "BOM" buttons are disabled placeholders. To manufacture a board (e.g. at JLCPCB), users need:

1. A PCB file that KiCad can open (component placement + netlist)
2. A BOM CSV for parts ordering
3. A Pick & Place CSV for assembly

The architecture must also prepare for future direct Gerber export when AI trace routing matures.

## Solution

Client-side export pipeline. Three pure functions transform CircuitDesign JSON into downloadable files. A new pad geometry library provides the physical pad data needed for KiCad footprints.

## Architecture

```
CircuitDesign JSON (existing)
  + padLibrary.ts   (NEW: package → pad geometry)
  + footprintLookup.ts (EXISTING: package → width/height/keepout)
  │
  ├─→ exportKicad.ts  → .kicad_pcb file download
  ├─→ exportBom.ts    → BOM.csv file download
  └─→ exportCpl.ts    → CPL.csv file download
```

All export runs in the browser. No server endpoints needed.

## Pad Geometry Library

New file `src/lib/padLibrary.ts` maps package names to pad definitions.

### PadDef Interface

```typescript
interface PadDef {
  id: string;        // matches pin id ("1", "2", "anode", etc.)
  x: number;         // mm relative to component center
  y: number;         // mm relative to component center
  shape: "circle" | "rect" | "oval";
  width: number;     // pad width in mm
  height: number;    // pad height in mm
  drill?: number;    // through-hole drill diameter (omit for SMD)
  layer: "front" | "back" | "through";
}
```

### Coverage (Initial Set, ~20 Package Types)

- **TH passives:** Axial_TH, Radial_TH, DO-35, DO-41
- **SMD passives:** 0805, 0603, 1206
- **LEDs:** 5mm_TH, 3mm_TH, LED_SMD_5050
- **Connectors:** USB_C_Receptacle, JST_PH_*pin, BarrelJack_TH, ScrewTerminal_*
- **ICs:** DIP-8, DIP-16, DIP-28, SOT-223, SOT-23, TO-220_TH, TO-92_TH
- **Dynamic:** PinHeader_1xN (computed from pin count, 2.54mm pitch)

### Unknown Package Fallback

For packages not in the pad library, generate pads from footprint dimensions — evenly spaced along the long axis. User can fix pad positions in KiCad.

## KiCad .kicad_pcb Export

Generates KiCad 8 S-expression format. Human-readable nested parentheses.

### Content Mapping

| DuckTape Data | KiCad Element |
|---|---|
| `board.width/height` | `gr_rect` on Edge.Cuts layer |
| `board.cornerRadius` | `gr_arc` corners on Edge.Cuts |
| `component.pcbPosition` | `footprint` with `at x y rotation` |
| `component.package` + pad library | `pad` entries inside footprint |
| `connection.netName` | `net` declarations + pad net assignments |
| `branding.name/version` | `gr_text` on F.SilkS or B.SilkS |

### Coordinate System

KiCad uses origin at top-left, Y-down — matches DuckTape's SVG coordinate system. Positions transfer directly without axis flipping.

### What the User Routes in KiCad

- Copper traces (no routing data in DuckTape yet)
- Copper zones / ground planes
- Vias

## BOM CSV Export

JLCPCB assembly BOM format:

```csv
Comment,Designator,Footprint,LCSC Part #
330 ohm,R1,Axial_TH,C58608
Red LED,D1,5mm_TH,C12624
```

All fields from `CircuitDesign.components`: `value` → Comment, `ref` → Designator, `package` → Footprint, `partNumber` → LCSC Part #. Missing MPNs left blank for user to fill in.

## Pick & Place (CPL) CSV Export

JLCPCB CPL format:

```csv
Designator,Mid X,Mid Y,Rotation,Layer
R1,5.0,10.0,0,Top
D1,15.0,10.0,90,Top
```

Maps directly from `pcbPosition`. Layer is "Top" for all components (front-side only for now).

## UI Changes

- "Download KiCad" button → wired to `.kicad_pcb` export
- "BOM" button → dropdown with "BOM CSV" and "Pick & Place CSV" options
- Both buttons enabled when a design exists

## Files Changed

### New Files
- `src/lib/padLibrary.ts` — Package → PadDef[] mapping
- `src/lib/exportKicad.ts` — .kicad_pcb generator
- `src/lib/exportBom.ts` — BOM CSV generator
- `src/lib/exportCpl.ts` — CPL CSV generator

### Modified Files
- `src/types/circuit.ts` — Add PadDef interface
- `src/components/DesignViewer.tsx` — Wire up export buttons + dropdown

### Unchanged
- `server/src/lib/componentLibrary.ts` — No changes
- `src/lib/footprintLookup.ts` — No changes
- `server/src/routes/` — No new API endpoints

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Export location | Client-side | Pure data transformation, no secrets, works offline |
| Pad data location | Separate padLibrary.ts | Keeps component library server-only, pad data client-only |
| KiCad format | .kicad_pcb only (no .kicad_sch) | PCB file has everything needed for routing |
| Unknown packages | Fallback pad generation | Evenly-spaced pads from footprint dimensions, user fixes in KiCad |
| BOM part numbers | Optional (blank if missing) | partNumber field not always populated by AI |
| Component layer | Always "Top" | All components front-side for now |

## Future-Proofing

- Pad library is the same data future Gerber export needs
- When AI routing lands, trace paths get added to CircuitDesign and both KiCad and Gerber exporters consume them
- Export functions are pure (design JSON in → string out) — easy to test and extend
- No .kicad_sch now, but the net/connection model supports adding it later

## Scope Boundaries (NOT Included)

- No trace routing
- No copper zones / ground planes
- No Gerber export
- No .kicad_sch schematic export
- No LCSC part number auto-lookup
- No multi-layer component placement (back side)
