# PCB-First Layout Editor — Design Document

## Problem

The AI generates component positions (pcbPositions) as part of the circuit design JSON, but LLMs cannot reliably perform spatial bin-packing arithmetic. Large components (LCD 1602 at 80x36mm, Arduino Nano at 43x18mm) frequently overlap because the AI can't calculate valid non-overlapping positions. The retry loop (2 attempts) burns API calls and still fails.

The current workflow is backwards: AI guesses positions → 3D renders them → user sees overlaps → no way to fix without re-chatting.

## Solution

Flip the workflow to PCB-first: the user assembles the board layout in a 2D PCB editor, then views the result in 3D. The 3D view becomes a read-only visualization of what the user built, not the primary workspace.

## New Workflow

```
Chat → AI generates design (components, connections, best-effort positions)
     → Server runs overlap resolver (fixes collisions algorithmically)
     → Client receives clean design
     → PCB tab opens automatically (new default tab)
     → User drags components to adjust layout
     → User switches to 3D tab to see the result
```

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Initial placement | AI places + server auto-resolves overlaps | Best of both worlds: AI gets approximate layout, algorithm guarantees no overlaps |
| PCB rendering | Simple colored rectangles | Fast to build, sufficient for placement. Pins/traces can be added later. |
| 3D sync | Manual refresh (switch to 3D tab) | Simplest, fully decoupled. No live re-rendering. |
| Overlap handling | Allow freely, show visual warning | Least frustrating for users. Check Design button already catches overlaps. |
| Tab order | Schematic \| PCB \| 3D, default to PCB | Matches the new PCB-first workflow |

## Architecture

### Data Flow

```
App state: currentDesign ←── set by chat response
                         ←── updated by PCB editor (position changes only)
                         ──→ read by PCB editor (renders board + components)
                         ──→ read by 3D renderer (renders scene on tab switch)
```

The design in App-level state becomes mutable. The PCB editor calls `onUpdatePosition(ref, newX, newY, newRotation)` to update component positions.

### New Components

#### 1. PcbLayoutEditor (`src/components/PcbLayoutEditor.tsx`)

SVG-based interactive PCB layout editor.

**Renders:**
- Board outline — rounded rectangle matching `design.board` dimensions, green fill
- Components — colored rectangles sized to footprint dimensions, positioned at pcbPosition
  - Blue = IC/module, Red = connector, Green = resistor, Yellow = LED, Gray = default
- Labels — ref designator + value as text on each rectangle
- Overlap warnings — red dashed border on overlapping components
- Board boundary warnings — orange dashed border if component extends past board edge

**Coordinate system:** SVG viewBox maps directly to mm (1 SVG unit = 1mm). Board at 100x80mm → viewBox approx `-5 -5 110 90`.

**Interactions:**
- Drag to move components (mousedown → mousemove → mouseup commits to App state)
- Right-click or rotate button cycles rotation by 90 degrees
- Mouse wheel zooms, shift+drag pans

**Does NOT include (YAGNI — future features):**
- Traces/routing
- Pad rendering
- Grid snapping
- Multi-select
- Undo/redo

#### 2. Overlap Resolver (`server/src/lib/resolveOverlaps.ts`)

Server-side algorithm that fixes overlapping positions deterministically.

**Algorithm — greedy largest-first:**
1. Sort components by footprint area (largest first)
2. For each component, check if current position overlaps any already-placed component
3. If overlap found, search outward for nearest valid position
4. If component ends up outside board, grow the board

**Integration:** Runs in the chat route after AI response is parsed. If validation found FOOTPRINT_OVERLAP errors, resolver patches positions in-place. Replaces retry loop for overlap errors specifically. Retry loop still handles non-spatial validation errors.

#### 3. Client-Side Footprint Lookup (`src/lib/footprintLookup.ts`)

Copy of the PACKAGE_FOOTPRINTS table and getFootprint() logic for the client side. Needed so the PCB editor can render rectangles at correct sizes without server round-trips.

Static data that changes rarely — small duplication is acceptable.

### Changes to Existing Files

- **`DesignViewer.tsx`** — Reorder tabs to Schematic | PCB | 3D. Default tab changes from `"3d"` to `"pcb"`. PCB tab renders `PcbLayoutEditor` instead of placeholder.
- **`App.tsx`** — Add `handleUpdatePosition` callback that mutates `currentDesign.components[i].pcbPosition`. Pass it down to DesignViewer → PcbLayoutEditor.
- **`server/src/routes/chat.ts`** — After validation, if FOOTPRINT_OVERLAP errors exist, run overlap resolver instead of (or before) retry loop.

## Future Enhancements

These are explicitly out of scope for this iteration but anticipated:
- Grid snapping
- Trace routing visualization
- Pin rendering on component footprints
- Multi-select and group drag
- Undo/redo
- Board resize handles
- Component rotation via keyboard shortcut
