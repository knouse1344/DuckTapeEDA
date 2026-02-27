export interface CircuitDesign {
  name: string;
  description: string;
  components: Component[];
  connections: Connection[];
  board: BoardSpec;
  notes: string[];
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
}

export interface Position {
  x: number;
  y: number;
  rotation: number;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  design?: CircuitDesign;
}
