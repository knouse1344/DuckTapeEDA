import * as THREE from "three";
import type { CircuitDesign, Component } from "../../types/circuit";

// Board color palette
const BOARD_COLORS: Record<string, number> = {
  green: 0x2d6b35,
  black: 0x1a1a1a,
  blue: 0x1a3a6b,
  red: 0x8b1a1a,
  white: 0xe8e8e0,
};
const BOARD_DEFAULT_COLOR = 0x2d6b35;
const COPPER = 0xb87333;
const SILKSCREEN = 0xffffff;
const METAL_SILVER = 0xc0c0c0;
const RESISTOR_BODY = 0x3b2a1a;
const LED_RED = 0xff1a1a;
const LED_GREEN = 0x00ff44;
const LED_BLUE = 0x1a8cff;
const LED_YELLOW = 0xffdd00;
const LED_WHITE = 0xffffee;
const USB_METAL = 0x888888;
const HASL_COLOR = 0xd4a847;
const HASL_SPECULAR = 0xffdd88;
const ELECTROLYTIC_BODY = 0x1a2a3a;
const ELECTROLYTIC_STRIPE = 0xdddddd;
const ELECTROLYTIC_TOP = 0x555566;

// ==========================================================================
// 3D Model Coordinate Conventions
// ==========================================================================
//
// COORDINATE SYSTEM:
//   Y = 0  → board surface (top of PCB)
//   Y > 0  → above the board (components grow upward)
//   Y < 0  → below the board (through-hole pins, solder joints)
//   X, Z   → board plane (component local coordinates)
//
// BUILDER CONTRACT:
//   Each build*() returns a THREE.Group with origin at the board surface,
//   centered on the component footprint.
//
// makeBeveledBox(w, h, d, bevel, material):
//   Creates geometry from Y=0 to Y=h, centered in X and Z.
//   When stacking parts on top:
//     nextBeveledBox.position.y = currentBox.position.y + currentBoxH
//
// BoxGeometry (center-anchored) on top of a makeBeveledBox:
//   Flush with top:  box.position.y = surfaceY + beveledBoxH - boxH/2
//   Sitting on top:  box.position.y = surfaceY + beveledBoxH + boxH/2
//
// DIMENSIONS: All measurements in millimeters (mm).
//   Reference real datasheet dimensions where possible.
// ==========================================================================

// Module-level silkscreen color (set per buildScene call, used by addLabel)
let currentSilkColor = SILKSCREEN;

export function buildScene(scene: THREE.Scene, design: CircuitDesign) {
  const { board } = design;

  // Center offset so board is centered at origin
  const cx = board.width / 2;
  const cz = board.height / 2;

  // --- PCB Board ---
  const boardThickness = 1.6;
  const boardColor = BOARD_COLORS[board.color || ""] || BOARD_DEFAULT_COLOR;
  const cornerR = board.cornerRadius || 0;

  // Use rounded shape if cornerRadius > 0, otherwise plain box
  let boardMesh: THREE.Mesh;
  if (cornerR > 0) {
    const boardShape = createRoundedRectShape(board.width, board.height, cornerR);
    const boardGeo = new THREE.ExtrudeGeometry(boardShape, {
      depth: boardThickness,
      bevelEnabled: false,
    });
    const boardMat = new THREE.MeshPhongMaterial({
      color: boardColor,
      specular: 0x111111,
      shininess: 30,
    });
    boardMesh = new THREE.Mesh(boardGeo, boardMat);
    boardMesh.rotation.x = -Math.PI / 2;
    boardMesh.position.set(-board.width / 2, -boardThickness, board.height / 2);
  } else {
    const boardGeo = new THREE.BoxGeometry(board.width, boardThickness, board.height);
    const boardMat = new THREE.MeshPhongMaterial({
      color: boardColor,
      specular: 0x111111,
      shininess: 30,
    });
    boardMesh = new THREE.Mesh(boardGeo, boardMat);
    boardMesh.position.set(0, -boardThickness / 2, 0);
  }
  scene.add(boardMesh);

  // Silkscreen color adapts to board — white on dark boards, dark on light boards
  const silkColor = (board.color === "white") ? 0x222222 : SILKSCREEN;
  currentSilkColor = silkColor;

  // Bottom copper layer (thin plane underneath)
  const copperGeo = new THREE.BoxGeometry(
    board.width - 1,
    0.035,
    board.height - 1
  );
  const copperMat = new THREE.MeshPhongMaterial({
    color: COPPER,
    specular: 0x664422,
    shininess: 60,
  });
  const copperBottom = new THREE.Mesh(copperGeo, copperMat);
  copperBottom.position.set(0, -boardThickness - 0.02, 0);
  scene.add(copperBottom);

  // Silkscreen border outline on top
  const borderGeo = new THREE.EdgesGeometry(
    new THREE.BoxGeometry(board.width - 0.5, 0.01, board.height - 0.5)
  );
  const borderMat = new THREE.LineBasicMaterial({ color: silkColor });
  const borderLine = new THREE.LineSegments(borderGeo, borderMat);
  borderLine.position.set(0, 0.01, 0);
  scene.add(borderLine);

  // --- Copper Traces ---
  drawTraces(scene, design, cx, cz);

  // --- Components ---
  for (const comp of design.components) {
    const pos = comp.pcbPosition;
    // Convert from board-relative mm to scene coords (centered)
    const x = pos.x - cx;
    const z = pos.y - cz;

    const group = buildComponent(comp);
    group.position.set(x, 0, z);

    // Auto-orient connectors to face off the nearest board edge
    const isConn = comp.type === "connector";
    if (isConn) {
      const edgeRotation = getEdgeRotation(pos.x, pos.y, board.width, board.height);
      group.rotation.y = (edgeRotation * Math.PI) / 180;
    } else if (pos.rotation) {
      group.rotation.y = (pos.rotation * Math.PI) / 180;
    }

    scene.add(group);
  }
}

/**
 * Build a single component model for gallery / dev preview.
 * Sets module-level silkscreen color (normally set by buildScene) and
 * delegates to the existing buildComponent dispatcher.
 */
export function buildComponentForGallery(comp: Component): THREE.Group {
  currentSilkColor = SILKSCREEN;
  return buildComponent(comp);
}

function buildComponent(comp: Component): THREE.Group {
  // Check for specific named components first (value-based dispatch)
  const val = comp.value?.toLowerCase() || "";
  let group: THREE.Group;

  if (val.includes("arduino nano")) group = buildArduinoNano(comp);
  else if (val.includes("raspberry pi pico")) group = buildPiPico(comp);
  else if (val.includes("ssd1306")) group = buildOLEDModule(comp);
  else if (val.includes("lcd 1602")) group = buildLCDModule(comp);
  else if (val.includes("dht22")) group = buildDHT22(comp);
  else if (val.includes("ws2812")) group = buildWS2812B(comp);
  else if (val.includes("piezo buzzer") || val.includes("passive buzzer")) group = buildBuzzer(comp);
  else {
    switch (comp.type) {
      case "resistor": group = buildResistor(comp); break;
      case "led": group = buildLED(comp); break;
      case "connector": group = buildConnector(comp); break;
      case "capacitor": group = buildCapacitor(comp); break;
      case "diode": group = buildDiode(comp); break;
      default: group = buildGenericIC(comp); break;
    }
  }

  // Dev-only: validate model positioning to catch floating parts
  if (import.meta.env.DEV) {
    validateComponentGroup(group, comp.ref || comp.value || "unknown");
  }

  return group;
}

// ---------------------------------------------------------------------------
// Component builders
// ---------------------------------------------------------------------------

function buildResistor(comp: Component): THREE.Group {
  const group = new THREE.Group();
  const isSMD = comp.package.includes("0805") || comp.package.includes("0603") || comp.package.includes("0402");

  if (isSMD) {
    // SMD resistor: beveled dark rectangle with metal end caps
    const body = makeBeveledBox(2, 0.5, 1.2, 0.08,
      new THREE.MeshPhongMaterial({ color: RESISTOR_BODY })
    );
    group.add(body);

    // End caps (metal terminations)
    const capMat = new THREE.MeshPhongMaterial({
      color: METAL_SILVER,
      shininess: 80,
    });
    const capL = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 1.2), capMat);
    capL.position.set(-0.9, 0.25, 0);
    group.add(capL);
    const capR = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 1.2), capMat);
    capR.position.set(0.9, 0.25, 0);
    group.add(capR);

    // SMD pads
    addRectPad(group, -0.9, 0, 0.6, 1.2);
    addRectPad(group, 0.9, 0, 0.6, 1.2);

    addLabel(group, comp.ref, 0, 1.2);
  } else {
    // Through-hole resistor: cylinder body with wire leads
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1, 3, 16),
      new THREE.MeshPhongMaterial({ color: 0xd4b896 }) // tan body
    );
    body.rotation.z = Math.PI / 2;
    body.position.y = 3;
    group.add(body);

    // Color bands (simplified: just a few rings)
    const bandColors = [0x964b00, 0xffa500, 0x964b00, 0xffd700]; // brown-orange-brown-gold (330 ohm)
    bandColors.forEach((color, i) => {
      const band = new THREE.Mesh(
        new THREE.CylinderGeometry(1.05, 1.05, 0.3, 16),
        new THREE.MeshPhongMaterial({ color })
      );
      band.rotation.z = Math.PI / 2;
      band.position.set(-0.9 + i * 0.6, 3, 0);
      group.add(band);
    });

    // Wire leads
    const wireMat = new THREE.MeshPhongMaterial({ color: METAL_SILVER });
    const wireGeo = new THREE.CylinderGeometry(0.15, 0.15, 3, 8);
    const wireL = new THREE.Mesh(wireGeo, wireMat);
    wireL.position.set(-2, 1.5, 0);
    group.add(wireL);
    const wireR = new THREE.Mesh(wireGeo, wireMat);
    wireR.position.set(2, 1.5, 0);
    group.add(wireR);

    // Pads
    addPad(group, -2, 0);
    addPad(group, 2, 0);

    addLabel(group, comp.ref, 0, 2.0);
  }

  return group;
}

function buildLED(comp: Component): THREE.Group {
  const group = new THREE.Group();
  const color = getLEDColor(comp.value);
  const isSMD = comp.package.includes("0805") || comp.package.includes("0603");

  if (isSMD) {
    // SMD LED: beveled colored body
    const body = makeBeveledBox(2, 0.8, 1.2, 0.06,
      new THREE.MeshPhongMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.3,
        transparent: true,
        opacity: 0.85,
      })
    );
    group.add(body);

    // SMD pads
    addRectPad(group, -0.9, 0, 0.6, 1.2);
    addRectPad(group, 0.9, 0, 0.6, 1.2);

    addLabel(group, comp.ref, 0, 1.2);
  } else {
    // 5mm through-hole LED: dome-topped cylinder
    // Clear/colored dome
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(2.5, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshPhongMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.4,
        transparent: true,
        opacity: 0.7,
        specular: 0xffffff,
        shininess: 100,
      })
    );
    dome.position.y = 5;
    group.add(dome);

    // Cylindrical body below dome
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(2.5, 2.5, 5, 16),
      new THREE.MeshPhongMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.3,
        transparent: true,
        opacity: 0.65,
      })
    );
    body.position.y = 2.5;
    group.add(body);

    // Flat bottom rim
    const rim = new THREE.Mesh(
      new THREE.CylinderGeometry(2.8, 2.8, 0.5, 16),
      new THREE.MeshPhongMaterial({ color, transparent: true, opacity: 0.8 })
    );
    rim.position.y = 0.25;
    group.add(rim);

    // Wire leads (anode longer than cathode)
    const wireMat = new THREE.MeshPhongMaterial({ color: METAL_SILVER });
    const anodeWire = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.15, 3, 8),
      wireMat
    );
    anodeWire.position.set(0.6, -1.5, 0);
    group.add(anodeWire);

    const cathodeWire = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.15, 2, 8),
      wireMat
    );
    cathodeWire.position.set(-0.6, -1, 0);
    group.add(cathodeWire);

    // Pads
    addPad(group, 0.6, 0);
    addPad(group, -0.6, 0);

    addLabel(group, comp.ref, 0, 4.0);
  }

  return group;
}

function buildConnector(comp: Component): THREE.Group {
  const group = new THREE.Group();
  const pkgLower = comp.package.toLowerCase();
  const valLower = comp.value.toLowerCase();
  const isUSBC = pkgLower.includes("usb") || valLower.includes("usb");
  const isJST = pkgLower.includes("jst") || valLower.includes("jst");

  if (isJST) {
    // JST PH connector: small white rectangular housing with pins
    // Model built with opening facing -Z (same convention as USB-C for auto-rotation)
    const pinCount = comp.pins?.length || 3;
    const pitch = 2.0; // mm
    const housingW = pitch * pinCount + 1.5; // width based on pin count
    const housingH = 4.5; // height
    const housingD = 6.0; // depth

    // White plastic housing
    const housingMat = new THREE.MeshPhongMaterial({
      color: 0xf5f0e8, // off-white/cream (like real JST PH)
      specular: 0x222222,
      shininess: 30,
    });
    const housing = new THREE.Mesh(
      new THREE.BoxGeometry(housingW, housingH, housingD),
      housingMat
    );
    housing.position.set(0, housingH / 2, housingD / 2 - 1.0);
    group.add(housing);

    // Opening/slot at the front (darker recess)
    const slotW = housingW - 1.0;
    const slotH = 3.5;
    const slotD = 1.5;
    const slotMat = new THREE.MeshPhongMaterial({ color: 0x222222 });
    const slot = new THREE.Mesh(
      new THREE.BoxGeometry(slotW, slotH, slotD),
      slotMat
    );
    slot.position.set(0, slotH / 2 + 0.5, -0.5);
    group.add(slot);

    // Internal dividers between pin slots
    const dividerMat = new THREE.MeshPhongMaterial({ color: 0xe8e0d4 });
    for (let i = 1; i < pinCount; i++) {
      const divX = -((pinCount - 1) * pitch) / 2 + i * pitch - pitch / 2;
      const divider = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, slotH - 0.5, slotD - 0.3),
        dividerMat
      );
      divider.position.set(divX, slotH / 2 + 0.6, -0.5);
      group.add(divider);
    }

    // Metal contact pins (gold-colored, extending down through the board)
    const pinMat = new THREE.MeshPhongMaterial({
      color: 0xdaa520,
      specular: 0xffdd44,
      shininess: 100,
    });
    for (let i = 0; i < pinCount; i++) {
      const pinX = -((pinCount - 1) * pitch) / 2 + i * pitch;
      // Vertical pin
      const pin = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 5.0, 0.3),
        pinMat
      );
      pin.position.set(pinX, 0, housingD / 2);
      group.add(pin);

      // Solder pad on board surface
      addRectPad(group, pinX, housingD / 2 + 1.0, 1.2, 1.5);
    }

    // Side retention clips
    const clipMat = new THREE.MeshPhongMaterial({ color: METAL_SILVER, shininess: 80 });
    for (const side of [-1, 1]) {
      const clip = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 3.0, 1.5),
        clipMat
      );
      clip.position.set(side * (housingW / 2 + 0.2), 1.5, housingD / 2 - 1.0);
      group.add(clip);
    }
  } else if (isUSBC) {
    // USB-C connector: realistic oval-port metal shell
    const shellMat = new THREE.MeshPhongMaterial({
      color: USB_METAL,
      specular: 0xcccccc,
      shininess: 100,
    });
    const darkMat = new THREE.MeshPhongMaterial({ color: 0x1a1a1a });
    const innerMat = new THREE.MeshPhongMaterial({ color: 0x333333 });

    const shellW = 9.0;   // width (X)
    const shellH = 3.4;   // height (Y)
    const shellD = 7.2;   // depth (Z)
    const shellR = 1.2;   // corner radius
    const overhang = 2.0; // mm the port sticks past the board edge

    // --- Outer metal shell ---
    const shellShape = createRoundedRectShape(shellW, shellH, shellR);
    const shellGeo = new THREE.ExtrudeGeometry(shellShape, {
      depth: shellD,
      bevelEnabled: false,
    });
    const shell = new THREE.Mesh(shellGeo, shellMat);
    shell.position.set(-shellW / 2, 0, -overhang);
    group.add(shell);

    // --- Port opening (dark oval recess at the front face) ---
    const openW = 8.2;
    const openH = 2.6;
    const openR = 1.0;
    const openShape = createRoundedRectShape(openW, openH, openR);
    const openGeo = new THREE.ExtrudeGeometry(openShape, {
      depth: 5.5,
      bevelEnabled: false,
    });
    const opening = new THREE.Mesh(openGeo, darkMat);
    opening.position.set(-openW / 2, (shellH - openH) / 2, -overhang - 0.01);
    group.add(opening);

    // --- Center tongue (thin contact strip inside port) ---
    const tongueW = 6.8;
    const tongueH = 0.6;
    const tongueD = 4.5;
    const tongue = new THREE.Mesh(
      new THREE.BoxGeometry(tongueW, tongueH, tongueD),
      innerMat
    );
    tongue.position.set(0, shellH / 2, -overhang + tongueD / 2 + 0.3);
    group.add(tongue);

    // --- Gold contact pads on tongue (top and bottom rows) ---
    const contactMat = new THREE.MeshPhongMaterial({
      color: 0xdaa520,
      specular: 0xffdd44,
      shininess: 120,
    });
    const contactCount = 6;
    const contactSpacing = tongueW / (contactCount + 1);
    for (let i = 1; i <= contactCount; i++) {
      const contactX = -tongueW / 2 + i * contactSpacing;
      const contactZ = -overhang + 1.5;
      const topContact = new THREE.Mesh(
        new THREE.BoxGeometry(0.35, 0.05, 1.8),
        contactMat
      );
      topContact.position.set(contactX, shellH / 2 + tongueH / 2 + 0.01, contactZ);
      group.add(topContact);
      const botContact = new THREE.Mesh(
        new THREE.BoxGeometry(0.35, 0.05, 1.8),
        contactMat
      );
      botContact.position.set(contactX, shellH / 2 - tongueH / 2 - 0.01, contactZ);
      group.add(botContact);
    }

    // --- Shield mounting legs (metal tabs soldered to board) ---
    const legMat = new THREE.MeshPhongMaterial({ color: METAL_SILVER, shininess: 80 });
    const legPositions = [
      { x: -shellW / 2 - 0.2, z: -overhang + 1 },
      { x: shellW / 2 + 0.2, z: -overhang + 1 },
      { x: -shellW / 2 - 0.2, z: shellD - overhang - 1 },
      { x: shellW / 2 + 0.2, z: shellD - overhang - 1 },
    ];
    for (const lp of legPositions) {
      const leg = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 1.0, 0.5),
        legMat
      );
      leg.position.set(lp.x, -0.5, lp.z);
      group.add(leg);
    }

    // --- SMD solder pads (on board surface behind the connector) ---
    for (let i = -3; i <= 3; i += 1.0) {
      addRectPad(group, i, shellD - overhang + 0.5, 0.45, 1.2);
    }
  } else {
    // Generic connector: simple pin header
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(5, 3, 2.5),
      new THREE.MeshPhongMaterial({ color: 0x222222 })
    );
    body.position.y = 1.5;
    group.add(body);
  }

  addLabel(group, comp.ref, 0, 5);
  return group;
}

function buildCapacitor(comp: Component): THREE.Group {
  const pkgLower = comp.package.toLowerCase();
  const isSMD = pkgLower.includes("0805") || pkgLower.includes("0603") || pkgLower.includes("0402");

  if (!isSMD) {
    // Through-hole capacitor — render as electrolytic
    return buildElectrolyticCapacitor(comp);
  }

  // SMD capacitor: beveled tan/yellow box
  const group = new THREE.Group();
  const body = makeBeveledBox(2, 0.8, 1.2, 0.06,
    new THREE.MeshPhongMaterial({ color: 0xc4a84d })
  );
  group.add(body);

  const capMat = new THREE.MeshPhongMaterial({ color: METAL_SILVER, shininess: 80 });
  const capL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.8, 1.2), capMat);
  capL.position.set(-0.9, 0.4, 0);
  group.add(capL);
  const capR = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.8, 1.2), capMat);
  capR.position.set(0.9, 0.4, 0);
  group.add(capR);

  // SMD pads
  addRectPad(group, -0.9, 0, 0.5, 1.2);
  addRectPad(group, 0.9, 0, 0.5, 1.2);

  addLabel(group, comp.ref, 0, 1.2);
  return group;
}

function buildElectrolyticCapacitor(comp: Component): THREE.Group {
  const group = new THREE.Group();
  const uF = parseCapacitance(comp.value);

  // Size scales with capacitance
  let radius: number, height: number;
  if (uF <= 10) { radius = 2.5; height = 5; }
  else if (uF <= 100) { radius = 3.0; height = 7; }
  else if (uF <= 470) { radius = 4.0; height = 9; }
  else { radius = 5.0; height = 11; }

  // Cylindrical aluminum body
  const bodyMat = new THREE.MeshPhongMaterial({
    color: ELECTROLYTIC_BODY,
    specular: 0x333333,
    shininess: 50,
  });
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, height, 24),
    bodyMat
  );
  body.position.y = height / 2 + 0.5;
  group.add(body);

  // Sleeve wrap (slightly larger, gives the rubber-sleeve look)
  const sleeveMat = new THREE.MeshPhongMaterial({
    color: 0x0d1b2a,
    specular: 0x111111,
    shininess: 15,
  });
  const sleeve = new THREE.Mesh(
    new THREE.CylinderGeometry(radius + 0.05, radius + 0.05, height - 0.6, 24),
    sleeveMat
  );
  sleeve.position.y = height / 2 + 0.5;
  group.add(sleeve);

  // Top cap (crimped aluminum)
  const topCap = new THREE.Mesh(
    new THREE.CylinderGeometry(radius - 0.2, radius - 0.2, 0.3, 24),
    new THREE.MeshPhongMaterial({ color: ELECTROLYTIC_TOP, specular: 0x444444, shininess: 60 })
  );
  topCap.position.y = height + 0.5;
  group.add(topCap);

  // Cross-score vent lines on top
  const scoreMat = new THREE.MeshPhongMaterial({ color: 0x444455 });
  const scoreLen = radius * 1.4;
  for (const rot of [0, Math.PI / 2]) {
    const score = new THREE.Mesh(
      new THREE.BoxGeometry(scoreLen, 0.05, 0.15),
      scoreMat
    );
    score.position.y = height + 0.66;
    score.rotation.y = rot;
    group.add(score);
  }

  // White polarity stripe
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, height * 0.7, radius * 0.5),
    new THREE.MeshPhongMaterial({ color: ELECTROLYTIC_STRIPE })
  );
  stripe.position.set(-(radius - 0.05), height / 2 + 0.5, 0);
  group.add(stripe);

  // Wire leads
  const leadSpacing = Math.min(radius * 0.8, 2.5);
  const wireMat = new THREE.MeshPhongMaterial({ color: METAL_SILVER });
  const wireGeo = new THREE.CylinderGeometry(0.15, 0.15, 2, 8);
  const wireL = new THREE.Mesh(wireGeo, wireMat);
  wireL.position.set(-leadSpacing / 2, -0.5, 0);
  group.add(wireL);
  const wireR = new THREE.Mesh(wireGeo, wireMat);
  wireR.position.set(leadSpacing / 2, -0.5, 0);
  group.add(wireR);

  // Pads
  addPad(group, -leadSpacing / 2, 0);
  addPad(group, leadSpacing / 2, 0);

  addLabel(group, comp.ref, 0, radius + 1.5);
  return group;
}

function buildDiode(comp: Component): THREE.Group {
  const group = new THREE.Group();

  // Beveled black body
  const body = makeBeveledBox(3, 1.5, 1.5, 0.1,
    new THREE.MeshPhongMaterial({ color: 0x222222 })
  );
  group.add(body);

  // Cathode band
  const band = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 1.55, 1.55),
    new THREE.MeshPhongMaterial({ color: SILKSCREEN })
  );
  band.position.set(-1, 0.75, 0);
  group.add(band);

  // Wire leads
  const wireMat = new THREE.MeshPhongMaterial({ color: METAL_SILVER });
  const wireGeo = new THREE.CylinderGeometry(0.15, 0.15, 2, 8);
  const wireL = new THREE.Mesh(wireGeo, wireMat);
  wireL.rotation.z = Math.PI / 2;
  wireL.position.set(-2.5, 0.75, 0);
  group.add(wireL);
  const wireR = new THREE.Mesh(wireGeo, wireMat);
  wireR.rotation.z = Math.PI / 2;
  wireR.position.set(2.5, 0.75, 0);
  group.add(wireR);

  // Pads
  addPad(group, -2.5, 0);
  addPad(group, 2.5, 0);

  addLabel(group, comp.ref, 0, 1.5);
  return group;
}

function buildWS2812B(comp: Component): THREE.Group {
  const group = new THREE.Group();

  // 5050 package: 5mm x 5mm x 1.6mm white body
  const bodyW = 5.0;
  const bodyD = 5.0;
  const bodyH = 1.6;

  // White ceramic/plastic body — beveled
  const bodyMat = new THREE.MeshPhongMaterial({ color: 0xf0f0f0, specular: 0x444444, shininess: 40 });
  const body = makeBeveledBox(bodyW, bodyH, bodyD, 0.15, bodyMat);
  group.add(body);

  // LED lens on top — translucent dome area (square with rounded feel)
  const lensH = 0.4;
  const lensMat = new THREE.MeshPhongMaterial({
    color: 0xffffee,
    emissive: 0xffffee,
    emissiveIntensity: 0.2,
    transparent: true,
    opacity: 0.75,
    specular: 0xffffff,
    shininess: 120,
  });
  const lens = new THREE.Mesh(
    new THREE.BoxGeometry(3.5, lensH, 3.5),
    lensMat
  );
  lens.position.y = bodyH + lensH / 2;
  group.add(lens);

  // Pin 1 marker — small triangle/notch at one corner
  const markerMat = new THREE.MeshPhongMaterial({ color: 0x333333 });
  const marker = new THREE.Mesh(
    new THREE.CircleGeometry(0.5, 3),
    markerMat
  );
  marker.rotation.x = -Math.PI / 2;
  marker.position.set(-bodyW / 2 + 0.8, bodyH + 0.01, -bodyD / 2 + 0.8);
  group.add(marker);

  // SMD solder pads — 4 pads on the bottom edges
  const padPositions = [
    { x: -2.1, z: -1.6 },  // Pin 1 (VDD)
    { x: -2.1, z: 1.6 },   // Pin 2 (DOUT)
    { x: 2.1, z: 1.6 },    // Pin 3 (VSS)
    { x: 2.1, z: -1.6 },   // Pin 4 (DIN)
  ];
  for (const pp of padPositions) {
    addRectPad(group, pp.x, pp.z, 1.2, 1.0);
  }

  // Thermal pad underneath (center)
  addRectPad(group, 0, 0, 3.2, 3.2);

  addLabel(group, comp.ref, 0, 3.5);
  return group;
}

// ---------------------------------------------------------------------------
// Recognizable component builders
// ---------------------------------------------------------------------------

function buildArduinoNano(comp: Component): THREE.Group {
  // Real dimensions: 18.0 x 45.0 x 1.6mm PCB (Arduino Nano V3.0)
  // Key features: Mini-USB, ATmega328P TQFP-32, CH340G, 2x15 pin headers, ICSP
  const group = new THREE.Group();
  const pcbW = 18;
  const pcbD = 45;
  const pcbH = 1.6;

  // Blue PCB board
  const pcbMat = new THREE.MeshPhongMaterial({ color: 0x1a4a8a, specular: 0x222244, shininess: 30 });
  const pcb = makeBeveledBox(pcbW, pcbH, pcbD, 0.3, pcbMat);
  group.add(pcb);

  // ATmega328P chip (black TQFP-32 in center of board)
  const chipMat = new THREE.MeshPhongMaterial({ color: 0x1a1a1a, specular: 0x222222, shininess: 20 });
  const chip = makeBeveledBox(7, 1.0, 7, 0.1, chipMat);
  chip.position.y = pcbH;
  group.add(chip);

  // Pin 1 dot on ATmega
  const dot = new THREE.Mesh(
    new THREE.CircleGeometry(0.3, 12),
    new THREE.MeshBasicMaterial({ color: 0xcccccc })
  );
  dot.rotation.x = -Math.PI / 2;
  dot.position.set(-2.5, pcbH + 1.01, -2.5);
  group.add(dot);

  // CH340G USB-serial chip (near USB port)
  addSMDChip(group, 5, 5, 0.8, 0, -pcbD / 2 + 9, pcbH);

  // Mini-USB port at one end (silver box)
  const usbMat = new THREE.MeshPhongMaterial({ color: USB_METAL, specular: 0xcccccc, shininess: 100 });
  const usb = new THREE.Mesh(new THREE.BoxGeometry(7.5, 3.5, 5.5), usbMat);
  usb.position.set(0, pcbH + 1.75, -pcbD / 2 + 2.5);
  group.add(usb);

  // USB port opening (dark)
  const usbOpen = new THREE.Mesh(
    new THREE.BoxGeometry(6.5, 2.2, 1),
    new THREE.MeshPhongMaterial({ color: 0x1a1a1a })
  );
  usbOpen.position.set(0, pcbH + 1.75, -pcbD / 2 + 0.01);
  group.add(usbOpen);

  // Crystal oscillator (silver can)
  const crystal = new THREE.Mesh(
    new THREE.CylinderGeometry(1.5, 1.5, 0.8, 12),
    new THREE.MeshPhongMaterial({ color: METAL_SILVER, shininess: 80 })
  );
  crystal.position.set(-4, pcbH + 0.4, 5);
  group.add(crystal);

  // Reset button (small silver square)
  const resetBtn = new THREE.Mesh(
    new THREE.BoxGeometry(2.5, 1.2, 2.5),
    new THREE.MeshPhongMaterial({ color: METAL_SILVER, shininess: 60 })
  );
  resetBtn.position.set(5, pcbH + 0.6, -8);
  group.add(resetBtn);

  // Two rows of 15 pin headers along edges
  const pitch = 2.54;
  const pinsPerSide = 15;
  const headerCenterZ = -pcbD / 2 + 3 + (pinsPerSide - 1) * pitch / 2;
  for (const side of [-1, 1]) {
    addPinHeaderRow(group, pinsPerSide, pitch, side * (pcbW / 2 - 1.5), headerCenterZ, "z", pcbH);
  }

  // ICSP 2x3 header pads (6 gold dots near center)
  const icspMat = new THREE.MeshPhongMaterial({ color: HASL_COLOR, specular: HASL_SPECULAR, shininess: 80 });
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 3; col++) {
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.05, 8), icspMat);
      pad.position.set(-1.27 + row * 2.54, pcbH + 0.02, 10 + col * 2.54);
      group.add(pad);
    }
  }

  // Power LED (green, tiny SMD)
  const pwrLed = new THREE.Mesh(
    new THREE.BoxGeometry(1.0, 0.5, 0.6),
    new THREE.MeshPhongMaterial({ color: 0x00ff44, emissive: 0x00ff44, emissiveIntensity: 0.3, transparent: true, opacity: 0.85 })
  );
  pwrLed.position.set(4, pcbH + 0.25, 12);
  group.add(pwrLed);

  // TX LED (green) and RX LED (orange) near the USB-serial chip
  const txLed = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 0.4, 0.5),
    new THREE.MeshPhongMaterial({ color: 0x00cc44, emissive: 0x00cc44, emissiveIntensity: 0.2, transparent: true, opacity: 0.85 })
  );
  txLed.position.set(-4, pcbH + 0.2, -pcbD / 2 + 12);
  group.add(txLed);

  const rxLed = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 0.4, 0.5),
    new THREE.MeshPhongMaterial({ color: 0xff8800, emissive: 0xff8800, emissiveIntensity: 0.2, transparent: true, opacity: 0.85 })
  );
  rxLed.position.set(-4, pcbH + 0.2, -pcbD / 2 + 14);
  group.add(rxLed);

  // Silkscreen "NANO" text on PCB
  addLabel(group, "NANO", 0, 0);

  // SMD passives scattered on board
  addSMDPassives(group, 4, pcbH, 3, -5, 6, 8);

  addLabel(group, comp.ref, 0, pcbD / 2 + 2);
  return group;
}

function buildPiPico(comp: Component): THREE.Group {
  // Real dimensions: 21.0 x 51.0 x 1.0mm PCB (Raspberry Pi Pico)
  // Key features: USB-C (Micro-USB on original), RP2040 QFN-56, W25Q16 flash, BOOTSEL, 2x20 headers, 3 SWD pads
  const group = new THREE.Group();
  const pcbW = 21;
  const pcbD = 51;
  const pcbH = 1.6;

  // Green PCB board
  const pcbMat = new THREE.MeshPhongMaterial({ color: 0x2d6b35, specular: 0x224422, shininess: 30 });
  const pcb = makeBeveledBox(pcbW, pcbH, pcbD, 0.3, pcbMat);
  group.add(pcb);

  // RP2040 chip (black QFN-56 square, center of board)
  addSMDChip(group, 7, 7, 1.0, 0, 0, pcbH);

  // USB-C port at one end
  const usbMat = new THREE.MeshPhongMaterial({ color: USB_METAL, specular: 0xcccccc, shininess: 100 });
  const usb = new THREE.Mesh(new THREE.BoxGeometry(9, 3.2, 7), usbMat);
  usb.position.set(0, pcbH + 1.6, -pcbD / 2 + 3);
  group.add(usb);

  const usbOpen = new THREE.Mesh(
    new THREE.BoxGeometry(8, 2.2, 1),
    new THREE.MeshPhongMaterial({ color: 0x1a1a1a })
  );
  usbOpen.position.set(0, pcbH + 1.6, -pcbD / 2 + 0.01);
  group.add(usbOpen);

  // W25Q16 flash memory chip (small black rectangle)
  addSMDChip(group, 4, 3, 0.8, 5, 8, pcbH, false);

  // BOOTSEL button (white tactile switch)
  const bootBtn = new THREE.Mesh(
    new THREE.CylinderGeometry(1.2, 1.2, 0.8, 12),
    new THREE.MeshPhongMaterial({ color: 0xf0f0e8, shininess: 40 })
  );
  bootBtn.position.set(-5, pcbH + 0.4, -10);
  group.add(bootBtn);

  // Two rows of 20 pin headers along edges
  const pitch = 2.54;
  const pinsPerSide = 20;
  const headerCenterZ = -pcbD / 2 + 3 + (pinsPerSide - 1) * pitch / 2;
  for (const side of [-1, 1]) {
    addPinHeaderRow(group, pinsPerSide, pitch, side * (pcbW / 2 - 1.5), headerCenterZ, "z", pcbH);
  }

  // 3 SWD debug pads at bottom of board
  const swdMat = new THREE.MeshPhongMaterial({ color: HASL_COLOR, specular: HASL_SPECULAR, shininess: 80 });
  for (let i = 0; i < 3; i++) {
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.05, 8), swdMat);
    pad.position.set(-2.54 + i * 2.54, pcbH + 0.02, pcbD / 2 - 3);
    group.add(pad);
  }

  // On-board LED (green)
  const led = new THREE.Mesh(
    new THREE.BoxGeometry(1.0, 0.5, 0.6),
    new THREE.MeshPhongMaterial({ color: 0x00ff44, emissive: 0x00ff44, emissiveIntensity: 0.3, transparent: true, opacity: 0.85 })
  );
  led.position.set(3, pcbH + 0.25, 14);
  group.add(led);

  // Silkscreen "Pico" label
  addLabel(group, "Pico", 0, -5);

  // SMD passives scattered on board
  addSMDPassives(group, 5, pcbH, -3, 5, 8, 10);

  addLabel(group, comp.ref, 0, pcbD / 2 + 2);
  return group;
}

function buildOLEDModule(comp: Component): THREE.Group {
  // Real dimensions: ~27 x 27mm PCB, 0.96" display (SSD1306 I2C module)
  // Key features: dark PCB, black bezel with OLED screen, FPC ribbon, 4 mounting holes, 4-pin header
  const group = new THREE.Group();
  const pcbW = 27;
  const pcbD = 27;
  const pcbH = 1.2;
  const bezelH = 1.8;

  // Dark blue/black PCB
  const pcbMat = new THREE.MeshPhongMaterial({ color: 0x0a1a3a, specular: 0x111133, shininess: 25 });
  const pcb = makeBeveledBox(pcbW, pcbH, pcbD, 0.3, pcbMat);
  group.add(pcb);

  // Display bezel (black frame around the screen)
  const bezelMat = new THREE.MeshPhongMaterial({ color: 0x0a0a0a, specular: 0x111111, shininess: 15 });
  const bezel = makeBeveledBox(25, bezelH, 16, 0.2, bezelMat);
  bezel.position.set(0, pcbH, -2);
  group.add(bezel);

  // Active screen area — flush with bezel top (pcbH + bezelH - screenH/2)
  const screenH = 0.3;
  const screenW = 22;
  const screenD = 11;
  const screenMat = new THREE.MeshPhongMaterial({
    color: 0x050510,
    emissive: 0x001833,
    emissiveIntensity: 0.6,
    specular: 0x445577,
    shininess: 140,
  });
  const screen = new THREE.Mesh(
    new THREE.BoxGeometry(screenW, screenH, screenD),
    screenMat
  );
  const screenTopY = pcbH + bezelH;
  screen.position.set(0, screenTopY - screenH / 2, -2);
  group.add(screen);

  // Thin border around screen perimeter (dark blue outline)
  const borderEdges = new THREE.EdgesGeometry(
    new THREE.BoxGeometry(screenW + 0.2, 0.02, screenD + 0.2)
  );
  const borderLine = new THREE.LineSegments(
    borderEdges,
    new THREE.LineBasicMaterial({ color: 0x1a3366 })
  );
  borderLine.position.set(0, screenTopY + 0.01, -2);
  group.add(borderLine);

  // Simulated display content — 3 faint blue text lines
  const textLineMat = new THREE.MeshBasicMaterial({
    color: 0x3388cc,
    transparent: true,
    opacity: 0.25,
  });
  const lineWidths = [16, 12, 18];
  for (let i = 0; i < 3; i++) {
    const textLine = new THREE.Mesh(
      new THREE.PlaneGeometry(lineWidths[i], 0.8),
      textLineMat
    );
    textLine.rotation.x = -Math.PI / 2;
    textLine.position.set(
      -screenW / 2 + lineWidths[i] / 2 + 2,
      screenTopY + 0.02,
      -2 - 3 + i * 3
    );
    group.add(textLine);
  }

  // Subtle screen reflection highlight — just above screen surface
  const glare = new THREE.Mesh(
    new THREE.PlaneGeometry(18, 4),
    new THREE.MeshBasicMaterial({ color: 0x223355, transparent: true, opacity: 0.12 })
  );
  glare.rotation.x = -Math.PI / 2;
  glare.position.set(-2, screenTopY + 0.03, -3);
  group.add(glare);

  // FPC ribbon cable connecting PCB to display glass (tan strip on back edge)
  const fpcMat = new THREE.MeshPhongMaterial({ color: 0xc4a35a, specular: 0x665533, shininess: 20 });
  const fpc = new THREE.Mesh(new THREE.BoxGeometry(20, 0.2, 2), fpcMat);
  fpc.position.set(0, pcbH + 0.6, -pcbD / 2 + 6);
  group.add(fpc);

  // 4 mounting holes at PCB corners
  const holeInset = 1.5;
  addMountingHoles(group, [
    { x: -pcbW / 2 + holeInset, z: -pcbD / 2 + holeInset },
    { x: pcbW / 2 - holeInset, z: -pcbD / 2 + holeInset },
    { x: -pcbW / 2 + holeInset, z: pcbD / 2 - holeInset },
    { x: pcbW / 2 - holeInset, z: pcbD / 2 - holeInset },
  ], 2.0);

  // SMD passives near pin header area
  addSMDPassives(group, 3, pcbH, 0, pcbD / 2 - 5, 10, 3);

  // 4-pin header along one edge
  addPinHeaderRow(group, 4, 2.54, 0, pcbD / 2 - 1.5, "x", pcbH);

  addLabel(group, comp.ref, 0, pcbD / 2 + 2);
  return group;
}

function buildLCDModule(comp: Component): THREE.Group {
  // Real dimensions: ~36 x 80mm PCB, 16x2 character LCD with I2C backpack
  // Key features: green PCB, metal frame, dark green display, I2C backpack with PCF8574
  const group = new THREE.Group();
  const pcbW = 36;
  const pcbD = 80;
  const pcbH = 1.6;
  const frameH = 4.5;

  // Green PCB
  const pcbMat = new THREE.MeshPhongMaterial({ color: 0x1a6b2a, specular: 0x224422, shininess: 25 });
  const pcb = makeBeveledBox(pcbW, pcbH, pcbD, 0.3, pcbMat);
  group.add(pcb);

  // LCD metal frame/bezel
  const frameMat = new THREE.MeshPhongMaterial({ color: 0x888888, specular: 0xaaaaaa, shininess: 60 });
  const frame = makeBeveledBox(33, frameH, 60, 0.3, frameMat);
  frame.position.set(0, pcbH, -5);
  group.add(frame);

  // Display window — flush with frame top (pcbH + frameH - displayH/2)
  const displayH = 0.3;
  const displayMat = new THREE.MeshPhongMaterial({
    color: 0x0a2a0a,
    emissive: 0x001a00,
    emissiveIntensity: 0.2,
    specular: 0x224422,
    shininess: 80,
  });
  const display = new THREE.Mesh(
    new THREE.BoxGeometry(28, displayH, 14),
    displayMat
  );
  display.position.set(0, pcbH + frameH - displayH / 2, -5);
  group.add(display);

  // Faint 16x2 character grid on the display surface
  const gridMat = new THREE.MeshBasicMaterial({ color: 0x0f3f0f, transparent: true, opacity: 0.4 });
  const charW = 1.5;
  const charD = 2.8;
  const gridStartX = -12.5;
  const gridStartZ = -5 - 3.5;
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 16; col++) {
      const cell = new THREE.Mesh(new THREE.PlaneGeometry(charW, charD), gridMat);
      cell.rotation.x = -Math.PI / 2;
      cell.position.set(
        gridStartX + col * 1.7,
        pcbH + frameH + 0.01,
        gridStartZ + row * 3.5
      );
      group.add(cell);
    }
  }

  // 4 mounting holes at PCB corners
  const holeInset = 2;
  addMountingHoles(group, [
    { x: -pcbW / 2 + holeInset, z: -pcbD / 2 + holeInset },
    { x: pcbW / 2 - holeInset, z: -pcbD / 2 + holeInset },
    { x: -pcbW / 2 + holeInset, z: pcbD / 2 - holeInset },
    { x: pcbW / 2 - holeInset, z: pcbD / 2 - holeInset },
  ], 3.0);

  // I2C backpack: 4-pin header along one edge
  addPinHeaderRow(group, 4, 2.54, 0, pcbD / 2 - 2, "x", pcbH);

  // PCF8574 I2C expander chip on the backpack area
  addSMDChip(group, 5, 4, 0.8, -6, pcbD / 2 - 6, pcbH);

  // Contrast potentiometer (small blue square)
  const pot = new THREE.Mesh(
    new THREE.BoxGeometry(3, 2, 3),
    new THREE.MeshPhongMaterial({ color: 0x2244aa })
  );
  pot.position.set(10, pcbH + 1.0, pcbD / 2 - 6);
  group.add(pot);

  addLabel(group, comp.ref, 0, pcbD / 2 + 2);
  return group;
}

function buildDHT22(comp: Component): THREE.Group {
  const group = new THREE.Group();
  const bodyW = 15;
  const bodyD = 7;
  const bodyH = 20;

  // White plastic housing
  const housingMat = new THREE.MeshPhongMaterial({
    color: 0xf0f0e8,
    specular: 0x333333,
    shininess: 30,
  });
  const housing = makeBeveledBox(bodyW, bodyH, bodyD, 0.5, housingMat);
  housing.position.y = 0.5;
  group.add(housing);

  // Vent/grid pattern — recessed slots cut into the front face
  // Dark recessed slots (inset into the housing, not protruding)
  const slotMat = new THREE.MeshPhongMaterial({ color: 0x666660 });
  for (let i = 0; i < 6; i++) {
    const slot = new THREE.Mesh(
      new THREE.BoxGeometry(10, 0.6, 0.5),
      slotMat
    );
    slot.position.set(0, 5 + i * 2.2, -bodyD / 2 + 0.25);
    group.add(slot);
  }

  // Vertical dividers in the grid (also recessed)
  for (let i = 0; i < 3; i++) {
    const vSlot = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 13, 0.5),
      slotMat
    );
    vSlot.position.set(-4 + i * 4, 10.5, -bodyD / 2 + 0.25);
    group.add(vSlot);
  }

  // "DHT22" label on front face
  addLabel(group, "DHT22", 0, -bodyD / 2 - 0.5);

  // 4 wire leads (SIP package) — through-hole extending below board
  const wireMat = new THREE.MeshPhongMaterial({ color: METAL_SILVER });
  const wireGeo = new THREE.CylinderGeometry(0.2, 0.2, 4, 8);
  const pinSpacing = 2.54;
  for (let i = 0; i < 4; i++) {
    const pinX = -((3) * pinSpacing) / 2 + i * pinSpacing;
    const wire = new THREE.Mesh(wireGeo, wireMat);
    wire.position.set(pinX, -1.5, 0);
    group.add(wire);
    addPad(group, pinX, 0);
  }

  addLabel(group, comp.ref, 0, bodyD / 2 + 2);
  return group;
}

function buildBuzzer(comp: Component): THREE.Group {
  // Real dimensions: ~12mm diameter, ~9.5mm height (typical piezo buzzer)
  // Key features: black cylinder, tone hole, concentric rings, 2 leads at 7.62mm spacing
  const group = new THREE.Group();
  const radius = 6;
  const height = 4;

  // Black cylindrical body with slight dome on top (larger radius at top)
  const bodyMat = new THREE.MeshPhongMaterial({ color: 0x1a1a1a, specular: 0x222222, shininess: 25 });
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius - 0.2, height, 24),
    bodyMat
  );
  body.position.y = height / 2 + 0.5;
  group.add(body);

  // Domed top cap — full hemisphere squashed flat, flush with cylinder top
  // Body top is at Y = height/2 + 0.5 + height/2 = height + 0.5 = 4.5
  const bodyTop = height + 0.5;
  const topFace = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshPhongMaterial({ color: 0x222222, specular: 0x333333, shininess: 15 })
  );
  topFace.scale.y = 0.15; // flatten to ~0.9mm dome
  topFace.position.y = bodyTop;
  group.add(topFace);

  // Surface Y for decorations sitting on top of the dome
  const domeTop = bodyTop + radius * 0.15; // ~5.4

  // Tone hole in center of top
  const holeMat = new THREE.MeshPhongMaterial({ color: 0x0a0a0a });
  const hole = new THREE.Mesh(
    new THREE.CylinderGeometry(1.5, 1.5, 0.3, 16),
    holeMat
  );
  hole.position.y = domeTop;
  group.add(hole);

  // Concentric rings on top (decorative)
  const ringMat = new THREE.MeshPhongMaterial({ color: 0x2a2a2a });
  for (const r of [3, 4.5]) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(r, 0.15, 8, 24),
      ringMat
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = domeTop;
    group.add(ring);
  }

  // Polarity marker (+ symbol on top, brighter for visibility)
  const plusMat = new THREE.MeshBasicMaterial({ color: 0xaaaaaa });
  const plusH = new THREE.Mesh(new THREE.BoxGeometry(2, 0.05, 0.3), plusMat);
  plusH.position.set(-3, domeTop + 0.1, 0);
  group.add(plusH);
  const plusV = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 2), plusMat);
  plusV.position.set(-3, domeTop + 0.1, 0);
  group.add(plusV);

  // Wire leads — realistic 7.62mm (0.3") spacing for 12mm buzzer
  const wireSpacing = 3.81;
  const wireMat = new THREE.MeshPhongMaterial({ color: METAL_SILVER });
  const wireGeo = new THREE.CylinderGeometry(0.15, 0.15, 3, 8);
  const wireL = new THREE.Mesh(wireGeo, wireMat);
  wireL.position.set(-wireSpacing, -1, 0);
  group.add(wireL);
  const wireR = new THREE.Mesh(wireGeo, wireMat);
  wireR.position.set(wireSpacing, -1, 0);
  group.add(wireR);

  addPad(group, -wireSpacing, 0);
  addPad(group, wireSpacing, 0);

  addLabel(group, comp.ref, 0, radius + 2);
  return group;
}

function buildGenericModule(comp: Component): THREE.Group {
  // Generic breakout board fallback — sizes to pin count, navy blue PCB
  const group = new THREE.Group();
  const pinCount = comp.pins?.length || 4;

  // Size PCB based on pin count
  const pitch = 2.54;
  const pcbW = Math.max(12, pinCount <= 8 ? 15 : 20);
  const pcbD = Math.max(12, pinCount * pitch * 0.6);
  const pcbH = 1.2;

  // Navy blue PCB (typical breakout board color)
  const pcbMat = new THREE.MeshPhongMaterial({ color: 0x0a1a4a, specular: 0x111133, shininess: 25 });
  const pcb = makeBeveledBox(pcbW, pcbH, pcbD, 0.2, pcbMat);
  group.add(pcb);

  // IC/chip on top
  const chipW = Math.min(pcbW - 4, 8);
  const chipD = Math.min(pcbD - 6, 8);
  addSMDChip(group, chipW, chipD, 0.8, 0, 0, pcbH);

  // Pin header row along one edge
  addPinHeaderRow(group, Math.min(pinCount, Math.floor((pcbW - 1) / pitch)), pitch, 0, pcbD / 2 - 1.5, "x", pcbH);

  // Power LED indicator (tiny green SMD)
  const pwrLed = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 0.4, 0.5),
    new THREE.MeshPhongMaterial({ color: 0x00ff44, emissive: 0x00ff44, emissiveIntensity: 0.3, transparent: true, opacity: 0.85 })
  );
  pwrLed.position.set(pcbW / 2 - 2, pcbH + 0.2, -pcbD / 2 + 2);
  group.add(pwrLed);

  // SMD passives for visual richness
  addSMDPassives(group, Math.min(3, Math.floor(pinCount / 3)), pcbH, -pcbW / 2 + 4, -pcbD / 2 + 3, 6, 3);

  addLabel(group, comp.ref, 0, pcbD / 2 + 2);
  return group;
}

function buildGenericIC(comp: Component): THREE.Group {
  const pkgLower = comp.package.toLowerCase();

  // Dispatch to specific IC package builders
  if (pkgLower.includes("dip")) {
    return buildDIP(comp);
  }
  if (pkgLower.includes("soic") || pkgLower.includes("sop") || pkgLower.includes("ssop")) {
    return buildSOIC(comp);
  }

  // Module packages → breakout board model
  if (pkgLower.includes("module") || pkgLower.includes("sip")) {
    return buildGenericModule(comp);
  }

  // Fallback: beveled generic IC box
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshPhongMaterial({ color: 0x1a1a1a, specular: 0x222222, shininess: 20 });
  const body = makeBeveledBox(5, 1.5, 5, 0.12, bodyMat);
  group.add(body);

  // Pin 1 dot
  const dot = new THREE.Mesh(
    new THREE.CircleGeometry(0.3, 12),
    new THREE.MeshBasicMaterial({ color: SILKSCREEN })
  );
  dot.rotation.x = -Math.PI / 2;
  dot.position.set(-1.8, 1.51, -1.8);
  group.add(dot);

  addLabel(group, comp.ref, 0, 4);
  return group;
}

function buildDIP(comp: Component): THREE.Group {
  const group = new THREE.Group();
  const pkgLower = comp.package.toLowerCase();
  const pinCount = comp.pins?.length || parseInt(pkgLower.match(/dip-?(\d+)/i)?.[1] || "8");
  const pinsPerSide = Math.ceil(pinCount / 2);
  const pitch = 2.54;
  const rowSpacing = 7.62; // 300-mil DIP standard
  const bodyW = 6.35;
  const bodyH = 3.5;
  const bodyD = (pinsPerSide - 1) * pitch + 2.0;

  // Black plastic body with beveled edges
  const bodyMat = new THREE.MeshPhongMaterial({ color: 0x1a1a1a, specular: 0x222222, shininess: 20 });
  const body = makeBeveledBox(bodyW, bodyH, bodyD, 0.15, bodyMat);
  group.add(body);

  // Pin 1 notch (semicircular indent at one end of the top face)
  const notchGeo = new THREE.CylinderGeometry(0.8, 0.8, 0.1, 16, 1, false, 0, Math.PI);
  const notch = new THREE.Mesh(
    notchGeo,
    new THREE.MeshPhongMaterial({ color: 0x333333 })
  );
  notch.rotation.x = -Math.PI / 2;
  notch.position.set(0, bodyH + 0.01, -bodyD / 2 + 0.5);
  group.add(notch);

  // Pin 1 dot
  const dot = new THREE.Mesh(
    new THREE.CircleGeometry(0.3, 12),
    new THREE.MeshBasicMaterial({ color: SILKSCREEN })
  );
  dot.rotation.x = -Math.PI / 2;
  dot.position.set(-bodyW / 2 + 0.8, bodyH + 0.02, -bodyD / 2 + 0.8);
  group.add(dot);

  // Through-hole pins (two rows of rectangular pins)
  const pinMat = new THREE.MeshPhongMaterial({ color: METAL_SILVER, shininess: 80 });
  for (let i = 0; i < pinsPerSide; i++) {
    const pinZ = -bodyD / 2 + 1.0 + i * pitch;

    // Left row pin — extends from below board up to body
    const leftPin = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 2.5, 0.25),
      pinMat
    );
    leftPin.position.set(-rowSpacing / 2, -0.25, pinZ);
    group.add(leftPin);
    addPad(group, -rowSpacing / 2, pinZ);

    // Right row pin
    const rightPin = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 2.5, 0.25),
      pinMat
    );
    rightPin.position.set(rowSpacing / 2, -0.25, pinZ);
    group.add(rightPin);
    addPad(group, rowSpacing / 2, pinZ);
  }

  addLabel(group, comp.ref, 0, bodyD / 2 + 1.5);
  return group;
}

function buildSOIC(comp: Component): THREE.Group {
  const group = new THREE.Group();
  const pkgLower = comp.package.toLowerCase();
  const pinCount = comp.pins?.length || parseInt(pkgLower.match(/soic-?(\d+)/i)?.[1] || "8");
  const pinsPerSide = Math.ceil(pinCount / 2);
  const pitch = 1.27;
  const bodyW = 4.0;
  const bodyH = 1.75;
  const bodyD = (pinsPerSide - 1) * pitch + 2.0;

  // Black plastic body with beveled edges
  const bodyMat = new THREE.MeshPhongMaterial({ color: 0x1a1a1a, specular: 0x222222, shininess: 20 });
  const body = makeBeveledBox(bodyW, bodyH, bodyD, 0.1, bodyMat);
  group.add(body);

  // Pin 1 dot
  const dot = new THREE.Mesh(
    new THREE.CircleGeometry(0.2, 12),
    new THREE.MeshBasicMaterial({ color: SILKSCREEN })
  );
  dot.rotation.x = -Math.PI / 2;
  dot.position.set(-bodyW / 2 + 0.6, bodyH + 0.01, -bodyD / 2 + 0.6);
  group.add(dot);

  // Gull-wing leads (two rows)
  const leadMat = new THREE.MeshPhongMaterial({ color: METAL_SILVER, shininess: 80 });
  for (let i = 0; i < pinsPerSide; i++) {
    const pinZ = -bodyD / 2 + 1.0 + i * pitch;

    for (const side of [-1, 1]) {
      // Horizontal arm extending from body side
      const arm = new THREE.Mesh(
        new THREE.BoxGeometry(1.0, 0.15, 0.35),
        leadMat
      );
      arm.position.set(side * (bodyW / 2 + 0.5), bodyH * 0.4, pinZ);
      group.add(arm);

      // Foot resting on the board surface
      const foot = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.08, 0.35),
        leadMat
      );
      foot.position.set(side * (bodyW / 2 + 0.9), 0.04, pinZ);
      group.add(foot);

      // Solder pad
      addRectPad(group, side * (bodyW / 2 + 0.9), pinZ, 0.8, 0.5);
    }
  }

  addLabel(group, comp.ref, 0, bodyD / 2 + 1.5);
  return group;
}

// ---------------------------------------------------------------------------
// Pad helpers
// ---------------------------------------------------------------------------

function addPad(group: THREE.Group, x: number, z: number) {
  // Through-hole pad with HASL finish
  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(0.6, 0.6, 0.05, 12),
    new THREE.MeshPhongMaterial({ color: HASL_COLOR, specular: HASL_SPECULAR, shininess: 100 })
  );
  pad.position.set(x, 0.01, z);
  group.add(pad);

  // Drill hole (dark center)
  const hole = new THREE.Mesh(
    new THREE.CircleGeometry(0.25, 8),
    new THREE.MeshBasicMaterial({ color: 0x222222 })
  );
  hole.rotation.x = -Math.PI / 2;
  hole.position.set(x, 0.04, z);
  group.add(hole);
}

function addRectPad(group: THREE.Group, x: number, z: number, w: number, d: number) {
  const pad = new THREE.Mesh(
    new THREE.BoxGeometry(w, 0.05, d),
    new THREE.MeshPhongMaterial({ color: HASL_COLOR, specular: HASL_SPECULAR, shininess: 100 })
  );
  pad.position.set(x, 0.01, z);
  group.add(pad);
}

// ---------------------------------------------------------------------------
// Silkscreen labels (canvas-texture text on the board surface)
// ---------------------------------------------------------------------------

function addLabel(group: THREE.Group, text: string, x: number, z: number) {
  if (!text) return;

  const canvas = document.createElement("canvas");
  const fontSize = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Measure text to size canvas
  ctx.font = `bold ${fontSize}px monospace`;
  const metrics = ctx.measureText(text);
  const textW = metrics.width;

  canvas.width = nextPowerOfTwo(textW + 24);
  canvas.height = nextPowerOfTwo(fontSize + 24);

  // Redraw after resize (canvas clears on resize)
  ctx.font = `bold ${fontSize}px monospace`;
  const colorStr = "#" + currentSilkColor.toString(16).padStart(6, "0");
  ctx.fillStyle = colorStr;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;

  const aspect = canvas.width / canvas.height;
  const labelH = 1.8; // mm in world space
  const labelW = labelH * aspect;

  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(labelW, labelH),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );

  // Flat on board surface, facing up
  plane.rotation.x = -Math.PI / 2;
  plane.position.set(x, 0.06, z);
  group.add(plane);
}

// ---------------------------------------------------------------------------
// Shared component sub-part helpers
// ---------------------------------------------------------------------------

const HEADER_BLACK = 0x1a1a1a;
const PIN_GOLD = 0xdaa520;
const PIN_GOLD_SPECULAR = 0xffdd44;

/**
 * Add a row of through-hole pin headers to a group.
 * Creates a black plastic housing strip with gold pins extending through it.
 * @param axis - 'x' or 'z': direction the pin row extends along
 */
function addPinHeaderRow(
  group: THREE.Group,
  pinCount: number,
  pitch: number,
  x: number,
  z: number,
  axis: "x" | "z",
  boardTopY: number,
  pinHeight: number = 5.5
): void {
  const headerMat = new THREE.MeshPhongMaterial({ color: HEADER_BLACK });
  const pinMat = new THREE.MeshPhongMaterial({ color: PIN_GOLD, specular: PIN_GOLD_SPECULAR, shininess: 100 });

  const stripLen = pinCount * pitch;
  const stripW = 2.5;
  const stripH = 2.5;

  const housing = new THREE.Mesh(
    axis === "z"
      ? new THREE.BoxGeometry(stripW, stripH, stripLen)
      : new THREE.BoxGeometry(stripLen, stripH, stripW),
    headerMat
  );
  housing.position.set(x, boardTopY + stripH / 2, z);
  group.add(housing);

  for (let i = 0; i < pinCount; i++) {
    const offset = -((pinCount - 1) * pitch) / 2 + i * pitch;
    const px = axis === "z" ? x : x + offset;
    const pz = axis === "z" ? z + offset : z;
    const pin = new THREE.Mesh(new THREE.BoxGeometry(0.5, pinHeight, 0.5), pinMat);
    pin.position.set(px, boardTopY + 0.25, pz);
    group.add(pin);
    addPad(group, px, pz);
  }
}

/**
 * Add mounting holes at specified positions (dark cylinders through the PCB).
 */
function addMountingHoles(
  group: THREE.Group,
  positions: Array<{ x: number; z: number }>,
  diameter: number = 2.5
): void {
  const holeMat = new THREE.MeshPhongMaterial({ color: 0x222222 });
  const r = diameter / 2;
  for (const pos of positions) {
    const hole = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 2, 16), holeMat);
    hole.position.set(pos.x, 0, pos.z);
    group.add(hole);
  }
}

/**
 * Scatter small SMD passive components (resistors/caps) in an area for visual realism.
 */
function addSMDPassives(
  group: THREE.Group,
  count: number,
  boardTopY: number,
  areaX: number,
  areaZ: number,
  areaW: number,
  areaD: number
): void {
  const colors = [0x3b2a1a, 0x2a2a3b, 0x3b3b2a]; // browns and dark tones
  for (let i = 0; i < count; i++) {
    const color = colors[i % colors.length];
    const mat = new THREE.MeshPhongMaterial({ color });
    const w = 0.8 + Math.random() * 0.6;
    const d = 0.4 + Math.random() * 0.3;
    const h = 0.3 + Math.random() * 0.2;
    const passive = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    // Distribute evenly across the area with slight randomness
    const t = count > 1 ? i / (count - 1) : 0.5;
    const px = areaX - areaW / 2 + t * areaW + (Math.random() - 0.5) * 1.5;
    const pz = areaZ - areaD / 2 + (Math.random()) * areaD;
    passive.position.set(px, boardTopY + h / 2, pz);
    group.add(passive);

    // End caps (silver solder terminals)
    const capMat = new THREE.MeshPhongMaterial({ color: METAL_SILVER, shininess: 60 });
    for (const side of [-1, 1]) {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.15, h, d), capMat);
      cap.position.set(px + side * (w / 2), boardTopY + h / 2, pz);
      group.add(cap);
    }
  }
}

/**
 * Add a black IC chip package with optional pin-1 dot.
 */
function addSMDChip(
  group: THREE.Group,
  w: number,
  d: number,
  h: number,
  x: number,
  z: number,
  boardTopY: number,
  pin1Dot: boolean = true
): void {
  const chipMat = new THREE.MeshPhongMaterial({ color: 0x1a1a1a, specular: 0x222222, shininess: 30 });
  const chip = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), chipMat);
  chip.position.set(x, boardTopY + h / 2, z);
  group.add(chip);

  if (pin1Dot) {
    const dotMat = new THREE.MeshPhongMaterial({ color: 0x888888 });
    const dot = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 8), dotMat);
    dot.position.set(x - w / 2 + 0.8, boardTopY + h + 0.02, z - d / 2 + 0.8);
    group.add(dot);
  }
}

// ---------------------------------------------------------------------------
// Dev-only model validation
// ---------------------------------------------------------------------------

/**
 * DEV ONLY: Validates that all meshes in a group are properly positioned.
 * Detects floating parts (gaps > threshold between stacked meshes).
 * Console-warns during development; tree-shaken in production builds.
 */
function validateComponentGroup(
  group: THREE.Group,
  componentName: string,
  boardSurfaceY: number = 0
): void {
  const warnings: string[] = [];
  const children = group.children.filter((c): c is THREE.Mesh => c instanceof THREE.Mesh);

  for (const child of children) {
    child.geometry.computeBoundingBox();
    const bb = child.geometry.boundingBox;
    if (!bb) continue;

    // Transform bounding box to world-space Y
    const minY = bb.min.y + child.position.y;
    const maxY = bb.max.y + child.position.y;

    // Check for meshes floating far above the board with nothing supporting them
    if (minY > boardSurfaceY + 8) {
      // Check if any other mesh occupies the gap below
      const hasSupport = children.some((other) => {
        if (other === child) return false;
        other.geometry.computeBoundingBox();
        const obb = other.geometry.boundingBox;
        if (!obb) return false;
        const otherMaxY = obb.max.y + other.position.y;
        return otherMaxY >= minY - 0.5; // within 0.5mm = supported
      });
      if (!hasSupport) {
        warnings.push(
          `"${componentName}": mesh at Y=${minY.toFixed(1)}-${maxY.toFixed(1)} may be floating (no support below)`
        );
      }
    }
  }

  for (const w of warnings) {
    console.warn(`[3D Model Validation] ${w}`);
  }
}

// ---------------------------------------------------------------------------
// Beveled box helper
// ---------------------------------------------------------------------------

/**
 * Create a mesh with rounded vertical edges, sitting on the XZ plane.
 * Returns a mesh centered in XZ, extending from y=0 to y=h.
 */
function makeBeveledBox(
  w: number, h: number, d: number, bevel: number, material: THREE.Material
): THREE.Mesh {
  const shape = createRoundedRectShape(w, d, bevel);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false });
  const mesh = new THREE.Mesh(geo, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(-w / 2, 0, d / 2);
  return mesh;
}

// ---------------------------------------------------------------------------
// Traces
// ---------------------------------------------------------------------------

function drawTraces(
  scene: THREE.Scene,
  design: CircuitDesign,
  cx: number,
  cz: number
) {
  const traceMat = new THREE.MeshPhongMaterial({
    color: COPPER,
    specular: 0x664422,
    shininess: 60,
  });

  // Draw simple traces between connected component positions
  for (const conn of design.connections) {
    if (conn.pins.length < 2) continue;

    const positions: THREE.Vector3[] = [];
    for (const pin of conn.pins) {
      const comp = design.components.find((c) => c.ref === pin.ref);
      if (!comp) continue;
      positions.push(
        new THREE.Vector3(
          comp.pcbPosition.x - cx,
          0.02,
          comp.pcbPosition.y - cz
        )
      );
    }

    // Deduplicate positions (multiple pins on same component)
    const unique: THREE.Vector3[] = [];
    for (const p of positions) {
      if (!unique.find((u) => u.distanceTo(p) < 0.1)) {
        unique.push(p);
      }
    }

    // Draw trace segments between unique positions
    for (let i = 0; i < unique.length - 1; i++) {
      const start = unique[i];
      const end = unique[i + 1];
      const dir = new THREE.Vector3().subVectors(end, start);
      const len = dir.length();
      if (len < 0.1) continue;

      const traceWidth = conn.traceWidth || 0.5;
      const traceGeo = new THREE.BoxGeometry(len, 0.035, traceWidth);
      const trace = new THREE.Mesh(traceGeo, traceMat);
      trace.position.copy(start).add(dir.multiplyScalar(0.5));
      trace.position.y = 0.02;
      trace.rotation.y = -Math.atan2(dir.z, dir.x);
      // Recalculate direction since we modified it
      const dir2 = new THREE.Vector3().subVectors(end, start).normalize();
      trace.rotation.y = -Math.atan2(dir2.z, dir2.x);
      scene.add(trace);
    }
  }
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

/**
 * Create a 2D rounded rectangle shape for extrusion.
 * Origin is at bottom-left corner.
 */
function createRoundedRectShape(
  width: number,
  height: number,
  radius: number
): THREE.Shape {
  const shape = new THREE.Shape();
  const r = Math.min(radius, width / 2, height / 2);

  shape.moveTo(r, 0);
  shape.lineTo(width - r, 0);
  shape.quadraticCurveTo(width, 0, width, r);
  shape.lineTo(width, height - r);
  shape.quadraticCurveTo(width, height, width - r, height);
  shape.lineTo(r, height);
  shape.quadraticCurveTo(0, height, 0, height - r);
  shape.lineTo(0, r);
  shape.quadraticCurveTo(0, 0, r, 0);

  return shape;
}

/**
 * Determine rotation (degrees) so a connector's opening faces off the nearest board edge.
 */
function getEdgeRotation(x: number, y: number, boardW: number, boardH: number): number {
  const distLeft = x;
  const distRight = boardW - x;
  const distTop = y;
  const distBottom = boardH - y;

  const minDist = Math.min(distLeft, distRight, distTop, distBottom);

  if (minDist === distLeft) return 90;    // face left
  if (minDist === distRight) return 270;  // face right
  if (minDist === distTop) return 0;      // face top
  return 180;                              // face bottom
}

function getLEDColor(value: string): number {
  const v = value.toLowerCase();
  if (v.includes("red")) return LED_RED;
  if (v.includes("green")) return LED_GREEN;
  if (v.includes("blue")) return LED_BLUE;
  if (v.includes("yellow") || v.includes("amber")) return LED_YELLOW;
  if (v.includes("white")) return LED_WHITE;
  return LED_RED; // default
}

function parseCapacitance(value: string): number {
  const match = value.match(/(\d+\.?\d*)\s*(u|μ)/i);
  if (match) return parseFloat(match[1]);
  return 10; // default to 10uF
}

function nextPowerOfTwo(n: number): number {
  return Math.pow(2, Math.ceil(Math.log2(Math.max(1, n))));
}
