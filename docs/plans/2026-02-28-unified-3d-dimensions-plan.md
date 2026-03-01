# Unified 3D Dimensions Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make 3D model builders read component dimensions from the shared footprint table instead of hardcoding them, fixing orientation and size mismatches between the PCB editor and 3D view.

**Architecture:** Import `getFootprint()` from `footprintLookup.ts` into `buildScene.ts`. Each 3D builder calls it to get PCB base dimensions (width→pcbW on X axis, height→pcbD on Z axis). Dedicated builders reposition visual details relative to the new axis mapping. Generic fallback builders use footprint dimensions instead of computing from pin count.

**Tech Stack:** TypeScript, Three.js, existing footprintLookup module

---

## Context

### The Axis Swap Problem

The footprint table convention is `width = X (left-right), height = Z (front-back)`. For dev boards, width is the long axis.

But the 3D builders have the opposite convention — they use `pcbW` for the narrow dimension (X) and `pcbD` for the long dimension (Z).

| Component | Footprint (w × h) | 3D Builder (pcbW × pcbD) | Axes Swapped? |
|---|---|---|---|
| Arduino Nano | 43 × 18 | 18 × 45 | YES |
| Pi Pico | 51 × 21 | 21 × 51 | YES |
| LCD 1602 | 80 × 36 | 36 × 80 | YES |
| OLED SSD1306 | 27 × 27 | 27 × 27 | No (square) |
| WS2812B | 5 × 5 | 5 × 5 | No (square) |
| DHT22 | 15 × 20 | 15 × 7 (body) | Exception (vertical sensor) |
| Buzzer | 12 × 12 | radius=6 | No (cylindrical) |

For **swapped builders** (Nano, Pico, LCD): every position formula that references pcbW/pcbD for placing visual details (USB ports, pin headers, chips) will compute different values when pcbW and pcbD swap. The formulas need updating so visual details land in the right spots.

**The swap pattern:** Where old code uses `pcbD` to position something along the long axis (Z), new code uses `pcbW` to position it along the long axis (X). Where old code uses `pcbW` for short-axis offset, new code uses `pcbD`.

### Files

- **Modify:** `src/components/threed/buildScene.ts` — All builder functions
- **Modify:** `src/lib/footprintLookup.ts` — Fix Arduino Nano value (43→45mm)
- **Modify:** `server/src/lib/footprintTable.ts` — Same Nano fix for server parity
- **Read-only reference:** `src/lib/footprintLookup.ts` (getFootprint API)

### Testing

There is no unit test framework for 3D rendering. Testing is visual:
1. Run `npm run dev` (starts both Vite dev server and Express server)
2. Send a test prompt: "Design me a PCB with an Arduino Nano, a 16x2 LCD display, a DHT22 temperature sensor, and an HC-SR04 ultrasonic sensor, powered by USB-C"
3. Check PCB tab — components should render at correct sizes
4. Switch to 3D tab — components should match PCB layout dimensions and orientation
5. Verify: no components floating off the board, no wildly wrong proportions

---

## Task 1: Import getFootprint into buildScene.ts

**Files:**
- Modify: `src/components/threed/buildScene.ts:1-3`

**Step 1: Add the import**

At the top of buildScene.ts (line 3, after existing imports), add:

```typescript
import { getFootprint } from "../../lib/footprintLookup";
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc -b`
Expected: No errors (getFootprint is already exported from footprintLookup.ts)

**Step 3: Commit**

```bash
git add src/components/threed/buildScene.ts
git commit -m "feat: import getFootprint into buildScene for unified dimensions"
```

---

## Task 2: Update buildGenericModule and buildGenericIC fallback

This is the highest-impact change — fixes HC-SR04 and all components without dedicated builders.

**Files:**
- Modify: `src/components/threed/buildScene.ts` — `buildGenericModule()` (lines 1335-1372) and `buildGenericIC()` fallback (lines 1390-1406)

**Step 1: Update buildGenericModule**

Replace the dynamic dimension computation with a getFootprint call. The function already receives `comp: Component`.

Current code (lines 1338-1344):
```typescript
const pinCount = comp.pins?.length || 4;
const pitch = 2.54;
const pcbW = Math.max(12, pinCount <= 8 ? 15 : 20);
const pcbD = Math.max(12, pinCount * pitch * 0.6);
const pcbH = 1.2;
```

Replace with:
```typescript
const fp = getFootprint(comp.package, comp.type, comp.value);
const pinCount = comp.pins?.length || 4;
const pitch = 2.54;
const pcbW = fp.width;
const pcbD = fp.height;
const pcbH = 1.2;
```

The rest of the function positions visual details relative to pcbW/pcbD. These will automatically adjust to the footprint dimensions.

Review the pin header row placement (line 1357) — `Math.min(pinCount, Math.floor((pcbW - 1) / pitch))` limits the pin count to fit pcbW. With correct dimensions (e.g. HC-SR04 at 45mm wide), more pins may fit. This is fine — the formula adapts.

Review chip size (lines 1352-1353) — `Math.min(pcbW - 4, 8)` caps the chip display at 8mm or pcbW-4. With larger pcbW values, this still looks reasonable.

**Step 2: Update buildGenericIC fallback**

The fallback case (lines 1390-1406) renders a 5×5mm black box. Replace it to read from footprint:

Current code (lines 1391-1394):
```typescript
const group = new THREE.Group();
const bodyMat = new THREE.MeshPhongMaterial({ color: 0x1a1a1a, specular: 0x222222, shininess: 20 });
const body = makeBeveledBox(5, 1.5, 5, 0.12, bodyMat);
group.add(body);
```

Replace with:
```typescript
const fp = getFootprint(comp.package, comp.type, comp.value);
const group = new THREE.Group();
const bodyMat = new THREE.MeshPhongMaterial({ color: 0x1a1a1a, specular: 0x222222, shininess: 20 });
const body = makeBeveledBox(fp.width, 1.5, fp.height, 0.12, bodyMat);
group.add(body);
```

Also update the pin-1 dot position (line 1402) to be relative to fp dimensions:
```typescript
dot.position.set(-fp.width / 2 + 0.7, 1.51, -fp.height / 2 + 0.7);
```

And the label position (line 1405):
```typescript
addLabel(group, comp.ref, 0, fp.height / 2 + 2);
```

**Step 3: Verify TypeScript compiles**

Run: `npx tsc -b`

**Step 4: Commit**

```bash
git add src/components/threed/buildScene.ts
git commit -m "feat: generic 3D builders read dimensions from footprint table"
```

---

## Task 3: Update buildArduinoNano

The Nano's axes are swapped: current pcbW=18 (X, narrow), pcbD=45 (Z, long). After: pcbW=45 (X, long), pcbD=18 (Z, narrow). All visual detail positions that reference pcbW or pcbD need axis-aware updates.

**Files:**
- Modify: `src/components/threed/buildScene.ts` — `buildArduinoNano()` (starts at line 793)

**Step 1: Replace hardcoded dimensions**

Current (lines 797-799):
```typescript
const pcbW = 18;
const pcbD = 45;
const pcbH = 1.6;
```

Replace with:
```typescript
const fp = getFootprint(comp.package, comp.type, comp.value);
const pcbW = fp.width;   // ~45mm (long axis, X)
const pcbD = fp.height;  // ~18mm (short axis, Z)
const pcbH = 1.6;
```

**Step 2: Update visual detail positions**

Apply the swap pattern throughout the function. Key elements:

**ATmega328P chip** — centered, no change needed (0, pcbH, 0).

**CH340G chip** (currently `addSMDChip(group, 5, 5, 0.8, 0, -pcbD/2 + 9, pcbH)`):
The chip is 9mm from one end of the long axis. The long axis is now X (pcbW), so swap the x and z arguments:
```typescript
addSMDChip(group, 5, 5, 0.8, -pcbW/2 + 9, 0, pcbH);
```

**Mini-USB port** (currently at `position(0, pcbH+1.75, -pcbD/2 + 2.5)`):
USB is at one end of the long axis. Long axis is now X:
```typescript
usb.position.set(-pcbW/2 + 2.5, pcbH + 1.75, 0);
```

**Pin headers** — run along the long axis (now X), offset along short axis (now Z). Find all `addPinHeaderRow` calls and swap the axis references. Headers should be at `z = ±(pcbD/2 - offset)` running along `"x"` direction.

**ICSP header, LEDs, crystal** — all follow the same swap pattern. For each positioned element:
- Where old code has `x = ±(pcbW/2 - n)` → change to `z = ±(pcbD/2 - n)`
- Where old code has `z = ±(pcbD/2 - n)` → change to `x = ±(pcbW/2 - n)`
- Keep Y (height) positions unchanged

**Step 3: Verify build**

Run: `npx tsc -b`

**Step 4: Commit**

```bash
git add src/components/threed/buildScene.ts
git commit -m "feat: buildArduinoNano reads from footprint table, fix axis mapping"
```

---

## Task 4: Update buildPiPico

Same axis swap as Nano: current pcbW=21 (narrow), pcbD=51 (long). After: pcbW=51 (long), pcbD=21 (narrow).

**Files:**
- Modify: `src/components/threed/buildScene.ts` — `buildPiPico()` (starts at line 905)

**Step 1: Replace hardcoded dimensions**

Current (lines 909-911):
```typescript
const pcbW = 21;
const pcbD = 51;
const pcbH = 1.6;
```

Replace with:
```typescript
const fp = getFootprint(comp.package, comp.type, comp.value);
const pcbW = fp.width;   // ~51mm (long axis, X)
const pcbD = fp.height;  // ~21mm (short axis, Z)
const pcbH = 1.6;
```

**Step 2: Update visual detail positions**

Apply the same swap pattern as Task 3:

**USB-C port** (currently at `position(0, pcbH+1.6, -pcbD/2+3)`):
```typescript
usb.position.set(-pcbW/2 + 3, pcbH + 1.6, 0);
```

**USB opening** (currently at `position(0, pcbH+1.6, -pcbD/2+0.01)`):
```typescript
usbOpen.position.set(-pcbW/2 + 0.01, pcbH + 1.6, 0);
```

**RP2040 chip** — centered, no change.

**Flash memory, BOOTSEL button, pin headers, SWD pads** — all follow the swap pattern. Swap X↔Z references for pcbW/pcbD in all position formulas.

**Step 3: Verify build**

Run: `npx tsc -b`

**Step 4: Commit**

```bash
git add src/components/threed/buildScene.ts
git commit -m "feat: buildPiPico reads from footprint table, fix axis mapping"
```

---

## Task 5: Update buildLCDModule

Current pcbW=36 (narrow), pcbD=80 (long). After: pcbW=80 (long), pcbD=36 (narrow).

**Files:**
- Modify: `src/components/threed/buildScene.ts` — `buildLCDModule()` (starts at line 1095)

**Step 1: Replace hardcoded dimensions**

Current (lines 1099-1101):
```typescript
const pcbW = 36;
const pcbD = 80;
const pcbH = 1.6;
```

Replace with:
```typescript
const fp = getFootprint(comp.package, comp.type, comp.value);
const pcbW = fp.width;   // ~80mm (long axis, X)
const pcbD = fp.height;  // ~36mm (short axis, Z)
const pcbH = 1.6;
```

**Step 2: Update visual detail positions**

**Metal frame/bezel** — currently sized `makeBeveledBox(33, frameH, 60, ...)` and positioned at `(0, pcbH, -5)`. The frame is 60mm along the long axis. With the swap, the frame's 60mm dimension should be along X. Update the makeBeveledBox call to swap W and D, and reposition:
```typescript
const frameMesh = makeBeveledBox(60, frameH, 33, 0.3, frameMat);
// ...
frameGroup.position.set(-5, pcbH, 0); // offset along X now
```

**Display window** — `BoxGeometry(28, displayH, 14)` — the 28mm dimension is along the long axis. Swap to `BoxGeometry(28, displayH, 14)` — if 28 was along X before, check if it needs swapping.

**I2C backpack, pin header** — at one end of the long axis. Swap Z→X positioning.

This builder has several sub-elements. Carefully trace each position formula and apply the swap pattern.

**Step 3: Verify build**

Run: `npx tsc -b`

**Step 4: Commit**

```bash
git add src/components/threed/buildScene.ts
git commit -m "feat: buildLCDModule reads from footprint table, fix axis mapping"
```

---

## Task 6: Update square/unchanged builders (OLED, WS2812B)

These builders have equal width and height (or don't need changes), so the axis swap doesn't apply. Just add the getFootprint call so they read from the shared source.

**Files:**
- Modify: `src/components/threed/buildScene.ts` — `buildOLEDModule()` (line 979), `buildWS2812B()` (line 730)

**Step 1: Update buildOLEDModule**

Current (lines 987-989):
```typescript
const pcbW = 27;
const pcbD = 27;
const pcbH = 1.2;
```

Replace with:
```typescript
const fp = getFootprint(comp.package, comp.type, comp.value);
const pcbW = fp.width;   // 27mm
const pcbD = fp.height;  // 27mm
const pcbH = 1.2;
```

No position changes needed — it's square.

**Step 2: Update buildWS2812B**

Current (lines 734-736):
```typescript
const bodyW = 5.0;
const bodyD = 5.0;
const bodyH = 1.6;
```

Replace with:
```typescript
const fp = getFootprint(comp.package, comp.type, comp.value);
const bodyW = fp.width;   // 5.0mm
const bodyD = fp.height;  // 5.0mm
const bodyH = 1.6;
```

No position changes needed — it's square.

**Builders left as-is:**
- **buildDHT22** — Design exception. Vertical sensor with unique 3D body shape. Footprint dimensions (15×20) represent board footprint, not the 3D body (15×7×20).
- **buildBuzzer** — Cylindrical component using radius=6 (diameter=12mm). Footprint is 12×12mm (square). Already matches.

**Step 3: Verify build**

Run: `npx tsc -b`

**Step 4: Commit**

```bash
git add src/components/threed/buildScene.ts
git commit -m "feat: OLED and WS2812B builders read from footprint table"
```

---

## Task 7: Footprint table value audit

Verify key dimensions against real datasheets. Known issue: Arduino Nano is 43mm in the table but 45mm in reality.

**Files:**
- Modify: `src/lib/footprintLookup.ts` — VALUE_FOOTPRINTS entries
- Modify: `server/src/lib/footprintTable.ts` — Matching server-side values (if applicable)

**Step 1: Fix Arduino Nano dimensions**

In `src/lib/footprintLookup.ts`, update VALUE_FOOTPRINTS:

```typescript
"arduino nano":                              { width: 45.0, height: 18.0, keepout: 1.5 },
"arduino nano development board":            { width: 45.0, height: 18.0, keepout: 1.5 },
```

Also update PACKAGE_FOOTPRINTS `Module_DIP_30pin` (line 146) — this is the Arduino Nano's package:
```typescript
"Module_DIP_30pin":        { width: 45.0, height: 18.0, keepout: 1.5 },
```

**Step 2: Verify other key values**

Cross-check against datasheets (no changes expected, just confirm):
- LCD 1602: 80 × 36mm ✓ (real: ~80 × 36mm)
- Pi Pico: 51 × 21mm ✓ (real: 51 × 21mm)
- HC-SR04: 45 × 20mm ✓ (real: 45 × 20mm)
- SSD1306 OLED: 27 × 27mm ✓ (real: ~27 × 27mm)

**Step 3: Mirror fix to server footprint table**

In `server/src/lib/footprintTable.ts`, find the Module_DIP_30pin entry and update to match:
```typescript
"Module_DIP_30pin":        { width: 45.0, height: 18.0, keepout: 1.5 },
```

Also check if the server's componentLibrary.ts has a corresponding entry and update if needed.

**Step 4: Verify build**

Run: `npx tsc -b`

**Step 5: Commit**

```bash
git add src/lib/footprintLookup.ts server/src/lib/footprintTable.ts
git commit -m "fix: correct Arduino Nano footprint dimensions (43→45mm)"
```

---

## Task 8: End-to-end visual verification

**Step 1: Start dev server**

Run: `npm run dev`

**Step 2: Send test prompt**

Use the stress test prompt:
> Design me a PCB with an Arduino Nano, a 16x2 LCD display, a DHT22 temperature sensor, and an HC-SR04 ultrasonic sensor, powered by USB-C

**Step 3: Verify PCB tab**

- Components render at correct sizes (same as before — footprint table didn't change much)
- Arduino Nano should be a wide rectangle (~45×18mm)
- HC-SR04 should be a wide rectangle (~45×20mm)
- LCD should be the largest rectangle (~80×36mm)

**Step 4: Switch to 3D tab — verify orientation match**

- Arduino Nano 3D model orientation should match its PCB rectangle (both landscape)
- LCD 1602 3D model should match its PCB rectangle
- HC-SR04 should be a correctly-sized blue module (not tiny)
- Components should not be floating off the board edges

**Step 5: Verify existing components still look right**

Send simpler prompt to test passive components:
> Design me a PCB that turns on an LED using USB-C for power

- Resistor, LED, USB-C connector should all render correctly in both views
- No visual regressions

**Step 6: Build check**

Run: `npx tsc -b && npx vite build`

Both should pass with no errors.

**Step 7: Commit any final fixes**

If any visual issues are found during verification, fix and commit.
