/**
 * Shared circuit design types — server-local copy.
 * Canonical source: src/types/circuit.ts (frontend)
 * Keep in sync when interfaces change.
 */

export interface CircuitDesign {
  name: string;
  description: string;
  components: Component[];
  connections: Connection[];
  board: BoardSpec;
  notes: string[];
  branding?: BrandingBlock;
  traces?: Trace[];
}

export interface Component {
  ref: string;
  type:
    | "resistor"
    | "capacitor"
    | "led"
    | "diode"
    | "connector"
    | "ic"
    | "mosfet"
    | "switch"
    | "regulator";
  value: string;
  package: string;
  partNumber?: string;
  description: string;
  pins: Pin[];
  schematicPosition: Position;
  pcbPosition: Position;
}

export interface Pin {
  id: string;
  name: string;
  type: "power" | "ground" | "signal" | "passive";
}

export interface Connection {
  netName: string;
  pins: { ref: string; pin: string }[];
  traceWidth?: number;
}

export interface BoardSpec {
  width: number;
  height: number;
  layers: 2;
  cornerRadius: number;
  color?: "green" | "black" | "blue" | "red" | "white";
}

export interface Position {
  x: number;
  y: number;
  rotation: number;
}

export interface BrandingBlock {
  layer: "front" | "back";
  layout: "stacked" | "horizontal";
  position: { x: number; y: number };
  scale: number;
  name: string;
  version: string;
}

export interface TracePoint {
  x: number;
  y: number;
}

export interface Trace {
  netName: string;
  width: number;
  layer: "front";
  points: TracePoint[];
}
