import * as THREE from "three";
import type { CircuitDesign, Component } from "../../types/circuit";

// Colors
const BOARD_GREEN = 0x2d6b35;
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

export function buildScene(scene: THREE.Scene, design: CircuitDesign) {
  const { board } = design;

  // Center offset so board is centered at origin
  const cx = board.width / 2;
  const cz = board.height / 2;

  // --- PCB Board ---
  const boardThickness = 1.6;
  const boardGeo = new THREE.BoxGeometry(
    board.width,
    boardThickness,
    board.height
  );

  // Round the board edges with a slightly larger shape
  const boardMat = new THREE.MeshPhongMaterial({
    color: BOARD_GREEN,
    specular: 0x111111,
    shininess: 30,
  });
  const boardMesh = new THREE.Mesh(boardGeo, boardMat);
  boardMesh.position.set(0, -boardThickness / 2, 0);
  scene.add(boardMesh);

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
  const borderMat = new THREE.LineBasicMaterial({ color: SILKSCREEN });
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

function buildComponent(comp: Component): THREE.Group {
  switch (comp.type) {
    case "resistor":
      return buildResistor(comp);
    case "led":
      return buildLED(comp);
    case "connector":
      return buildConnector(comp);
    case "capacitor":
      return buildCapacitor(comp);
    case "diode":
      return buildDiode(comp);
    default: {
      // Check for specific ICs with custom models
      const val = comp.value?.toLowerCase() || "";
      if (val.includes("ws2812")) return buildWS2812B(comp);
      return buildGenericIC(comp);
    }
  }
}

function buildResistor(comp: Component): THREE.Group {
  const group = new THREE.Group();
  const isSMD = comp.package.includes("0805") || comp.package.includes("0603") || comp.package.includes("0402");

  if (isSMD) {
    // SMD resistor: small dark rectangle
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(2, 0.5, 1.2),
      new THREE.MeshPhongMaterial({ color: RESISTOR_BODY })
    );
    body.position.y = 0.25;
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
  }

  // Silkscreen label
  addLabel(group, comp.ref, 0, 0);

  return group;
}

function buildLED(comp: Component): THREE.Group {
  const group = new THREE.Group();
  const color = getLEDColor(comp.value);
  const isSMD = comp.package.includes("0805") || comp.package.includes("0603");

  if (isSMD) {
    // SMD LED
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(2, 0.8, 1.2),
      new THREE.MeshPhongMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.3,
        transparent: true,
        opacity: 0.85,
      })
    );
    body.position.y = 0.4;
    group.add(body);
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
  }

  addLabel(group, comp.ref, 0, 0);
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
      const pad = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 0.05, 1.5),
        new THREE.MeshPhongMaterial({ color: COPPER, shininess: 60 })
      );
      pad.position.set(pinX, 0.01, housingD / 2 + 1.0);
      group.add(pad);
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
    // Model is built with opening facing -Z at the group origin.
    // The body extends in +Z (onto the board). A small overhang extends past
    // the origin in -Z so the port sticks out past the board edge.
    // Auto-rotation in buildScene orients the opening toward the nearest edge.
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
    // ExtrudeGeometry extrudes shape in +Z from z=0.
    // We offset so the front face is at z = -overhang, back at z = shellD - overhang.
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
    const padMat = new THREE.MeshPhongMaterial({ color: COPPER, shininess: 60 });
    for (let i = -3; i <= 3; i += 1.0) {
      const pad = new THREE.Mesh(
        new THREE.BoxGeometry(0.45, 0.05, 1.2),
        padMat
      );
      pad.position.set(i, 0.01, shellD - overhang + 0.5);
      group.add(pad);
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
  const group = new THREE.Group();

  // SMD capacitor: small tan/yellow box
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(2, 0.8, 1.2),
    new THREE.MeshPhongMaterial({ color: 0xc4a84d })
  );
  body.position.y = 0.4;
  group.add(body);

  const capMat = new THREE.MeshPhongMaterial({ color: METAL_SILVER, shininess: 80 });
  const capL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.8, 1.2), capMat);
  capL.position.set(-0.9, 0.4, 0);
  group.add(capL);
  const capR = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.8, 1.2), capMat);
  capR.position.set(0.9, 0.4, 0);
  group.add(capR);

  addLabel(group, comp.ref, 0, 0);
  return group;
}

function buildDiode(comp: Component): THREE.Group {
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(3, 1.5, 1.5),
    new THREE.MeshPhongMaterial({ color: 0x222222 })
  );
  body.position.y = 0.75;
  group.add(body);

  // Cathode band
  const band = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 1.55, 1.55),
    new THREE.MeshPhongMaterial({ color: SILKSCREEN })
  );
  band.position.set(-1, 0.75, 0);
  group.add(band);

  addLabel(group, comp.ref, 0, 0);
  return group;
}

function buildWS2812B(comp: Component): THREE.Group {
  const group = new THREE.Group();

  // 5050 package: 5mm x 5mm x 1.6mm white body
  const bodyW = 5.0;
  const bodyD = 5.0;
  const bodyH = 1.6;

  // White ceramic/plastic body
  const bodyMat = new THREE.MeshPhongMaterial({ color: 0xf0f0f0, specular: 0x444444, shininess: 40 });
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(bodyW, bodyH, bodyD),
    bodyMat
  );
  body.position.y = bodyH / 2;
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
  const padMat = new THREE.MeshPhongMaterial({ color: COPPER, shininess: 60 });
  const padPositions = [
    { x: -2.1, z: -1.6 },  // Pin 1 (VDD)
    { x: -2.1, z: 1.6 },   // Pin 2 (DOUT)
    { x: 2.1, z: 1.6 },    // Pin 3 (VSS)
    { x: 2.1, z: -1.6 },   // Pin 4 (DIN)
  ];
  for (const pp of padPositions) {
    const pad = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.05, 1.0),
      padMat
    );
    pad.position.set(pp.x, 0.01, pp.z);
    group.add(pad);
  }

  // Thermal pad underneath (center)
  const thermalPad = new THREE.Mesh(
    new THREE.BoxGeometry(3.2, 0.05, 3.2),
    padMat
  );
  thermalPad.position.set(0, 0.01, 0);
  group.add(thermalPad);

  addLabel(group, comp.ref, 0, 0);
  return group;
}

function buildGenericIC(comp: Component): THREE.Group {
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(5, 1.5, 5),
    new THREE.MeshPhongMaterial({ color: 0x1a1a1a })
  );
  body.position.y = 0.75;
  group.add(body);

  // Pin 1 dot
  const dot = new THREE.Mesh(
    new THREE.CircleGeometry(0.3, 12),
    new THREE.MeshBasicMaterial({ color: SILKSCREEN })
  );
  dot.rotation.x = -Math.PI / 2;
  dot.position.set(-1.8, 1.51, -1.8);
  group.add(dot);

  addLabel(group, comp.ref, 0, 0);
  return group;
}

function addPad(group: THREE.Group, x: number, z: number) {
  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(0.6, 0.6, 0.05, 12),
    new THREE.MeshPhongMaterial({ color: COPPER, shininess: 60 })
  );
  pad.position.set(x, 0.01, z);
  group.add(pad);
}

function addLabel(
  _group: THREE.Group,
  _text: string,
  _x: number,
  _z: number
) {
  // Text rendering in Three.js requires font loading.
  // For now, labels are omitted — they'll show in the PCB/schematic SVG views.
  // Could add canvas-texture text labels later.
}

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
 * The USB-C model is built with its opening facing -Z.
 *   rotation 0   → opening faces -Z (top edge, y=0 in board coords)
 *   rotation 90  → opening faces -X (left edge, x=0)
 *   rotation 180 → opening faces +Z (bottom edge, y=max)
 *   rotation 270 → opening faces +X (right edge, x=max)
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
