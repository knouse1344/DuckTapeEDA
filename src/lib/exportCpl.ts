import type { CircuitDesign } from "../types/circuit";

/**
 * Generate JLCPCB-format Pick & Place (CPL) CSV from a CircuitDesign.
 * Columns: Designator, Mid X, Mid Y, Rotation, Layer
 */
export function generateCplCsv(design: CircuitDesign): string {
  const lines: string[] = [
    "Designator,Mid X,Mid Y,Rotation,Layer",
  ];

  for (const comp of design.components) {
    const designator = comp.ref;
    const midX = comp.pcbPosition.x.toFixed(2);
    const midY = comp.pcbPosition.y.toFixed(2);
    const rotation = comp.pcbPosition.rotation.toFixed(0);
    const layer = "Top";  // All components on front side for now
    lines.push(`${designator},${midX},${midY},${rotation},${layer}`);
  }

  return lines.join("\n");
}
