export interface CircuitDesign {
  name: string;
  description: string;
  components: Component[];
  connections: Connection[];
  board: BoardSpec;
  notes: string[];
  branding?: BrandingBlock;
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
  /** Which silkscreen layer: front (top) or back (bottom) */
  layer: "front" | "back";
  /** Layout of logo + text: stacked (logo above text) or horizontal (logo left, text right) */
  layout: "stacked" | "horizontal";
  /** Position on the board in mm, same coordinate system as pcbPosition */
  position: { x: number; y: number };
  /** Size multiplier for the entire branding block (1 = default ~8mm logo width) */
  scale: number;
  /** Board name displayed on the silkscreen */
  name: string;
  /** Version string in "M-YY vN" format, e.g. "2-26 v1" */
  version: string;
}

/** Physical pad definition for a component package */
export interface PadDef {
  /** Matches pin id from component ("1", "2", "anode", "VBUS", etc.) */
  id: string;
  /** X offset in mm relative to component center */
  x: number;
  /** Y offset in mm relative to component center */
  y: number;
  /** Pad shape */
  shape: "circle" | "rect" | "oval";
  /** Pad width in mm */
  width: number;
  /** Pad height in mm */
  height: number;
  /** Through-hole drill diameter in mm (omit for SMD pads) */
  drill?: number;
  /** Which side: "front" = F.Cu SMD, "back" = B.Cu SMD, "through" = all copper layers */
  layer: "front" | "back" | "through";
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  design?: CircuitDesign;
}
