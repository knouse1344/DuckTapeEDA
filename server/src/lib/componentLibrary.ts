/**
 * Component Library — verified component definitions with real pins, packages, and specs.
 *
 * Each entry represents a component TEMPLATE that Claude should use when designing.
 * The AI picks from this library instead of inventing components from scratch.
 *
 * To add a new component: add an entry to the appropriate category array, then
 * re-export it. The system prompt builder will automatically include it.
 */

export interface LibraryPin {
  id: string;
  name: string;
  type: "power" | "ground" | "signal" | "passive";
}

export interface LibraryComponent {
  /** Unique ID within the library, e.g. "RES_330_TH" */
  id: string;
  /** Component type matching the CircuitDesign schema */
  type: "resistor" | "capacitor" | "led" | "diode" | "connector" | "ic" | "mosfet" | "switch" | "regulator";
  /** Human-readable name */
  name: string;
  /** Default value string, e.g. "330 ohm" */
  value: string;
  /** Package/footprint, e.g. "Axial_TH" */
  package: string;
  /** Manufacturer part number (if applicable) */
  partNumber?: string;
  /** What this component is for */
  description: string;
  /** Pin definitions — the ground truth for this part */
  pins: LibraryPin[];
  /** Key electrical specs */
  specs?: Record<string, string>;
  /** Tags for search/matching, e.g. ["power", "usb", "5v"] */
  tags: string[];
}

// ─── RESISTORS ───────────────────────────────────────────────
const resistors: LibraryComponent[] = [
  {
    id: "RES_TH",
    type: "resistor",
    name: "Through-hole Resistor",
    value: "resistor",
    package: "Axial_TH",
    description: "Standard 1/4W through-hole resistor. Set 'value' to the needed resistance (e.g. '330 ohm', '10k ohm', '4.7k ohm').",
    pins: [
      { id: "1", name: "1", type: "passive" },
      { id: "2", name: "2", type: "passive" },
    ],
    specs: { power: "0.25W", tolerance: "5%" },
    tags: ["passive", "through-hole", "basic"],
  },
  {
    id: "RES_0805",
    type: "resistor",
    name: "SMD Resistor 0805",
    value: "resistor",
    package: "0805",
    description: "Standard SMD 0805 resistor. Set 'value' to the needed resistance.",
    pins: [
      { id: "1", name: "1", type: "passive" },
      { id: "2", name: "2", type: "passive" },
    ],
    specs: { power: "0.125W", tolerance: "1%" },
    tags: ["passive", "smd", "basic"],
  },
];

// ─── CAPACITORS ──────────────────────────────────────────────
const capacitors: LibraryComponent[] = [
  {
    id: "CAP_CERAMIC_TH",
    type: "capacitor",
    name: "Ceramic Capacitor (Through-hole)",
    value: "100nF",
    package: "Radial_TH",
    description: "Ceramic disc capacitor, commonly used for decoupling. Set 'value' as needed (e.g. '100nF', '10uF').",
    pins: [
      { id: "1", name: "1", type: "passive" },
      { id: "2", name: "2", type: "passive" },
    ],
    specs: { voltage: "50V", type: "ceramic" },
    tags: ["passive", "through-hole", "decoupling", "basic"],
  },
  {
    id: "CAP_ELECTROLYTIC_TH",
    type: "capacitor",
    name: "Electrolytic Capacitor (Through-hole)",
    value: "10uF",
    package: "Radial_TH",
    description: "Polarized electrolytic capacitor for bulk filtering. Set 'value' as needed. Pin 1 is positive (+).",
    pins: [
      { id: "1", name: "+", type: "passive" },
      { id: "2", name: "-", type: "passive" },
    ],
    specs: { voltage: "25V", type: "electrolytic", polarized: "yes" },
    tags: ["passive", "through-hole", "filtering", "polarized"],
  },
  {
    id: "CAP_0805",
    type: "capacitor",
    name: "SMD Capacitor 0805",
    value: "100nF",
    package: "0805",
    description: "SMD ceramic capacitor 0805. Set 'value' as needed.",
    pins: [
      { id: "1", name: "1", type: "passive" },
      { id: "2", name: "2", type: "passive" },
    ],
    specs: { voltage: "25V", type: "ceramic" },
    tags: ["passive", "smd", "decoupling"],
  },
];

// ─── LEDS ────────────────────────────────────────────────────
const leds: LibraryComponent[] = [
  {
    id: "LED_5MM_TH",
    type: "led",
    name: "5mm Through-hole LED",
    value: "red LED",
    package: "5mm_TH",
    description: "Standard 5mm LED. Set 'value' to color (e.g. 'red LED', 'green LED', 'blue LED', 'white LED'). Pin 1 (Anode/+) goes to the resistor, Pin 2 (Cathode/-) goes to GND. ALWAYS requires a current-limiting resistor.",
    pins: [
      { id: "1", name: "Anode", type: "passive" },
      { id: "2", name: "Cathode", type: "passive" },
    ],
    specs: { forwardVoltage: "2.0V (red), 3.0V (blue/white)", forwardCurrent: "20mA" },
    tags: ["indicator", "through-hole", "basic"],
  },
  {
    id: "LED_0805",
    type: "led",
    name: "SMD LED 0805",
    value: "red LED",
    package: "0805",
    description: "SMD 0805 LED. Set 'value' to color. Pin 1 = Anode, Pin 2 = Cathode. ALWAYS requires a current-limiting resistor.",
    pins: [
      { id: "1", name: "Anode", type: "passive" },
      { id: "2", name: "Cathode", type: "passive" },
    ],
    specs: { forwardVoltage: "2.0V (red), 3.0V (blue/white)", forwardCurrent: "20mA" },
    tags: ["indicator", "smd"],
  },
];

// ─── DIODES ──────────────────────────────────────────────────
const diodes: LibraryComponent[] = [
  {
    id: "DIODE_1N4148",
    type: "diode",
    name: "1N4148 Signal Diode",
    value: "1N4148",
    package: "DO-35_TH",
    partNumber: "1N4148",
    description: "General-purpose signal diode. Pin 1 = Anode, Pin 2 = Cathode (band side).",
    pins: [
      { id: "1", name: "Anode", type: "passive" },
      { id: "2", name: "Cathode", type: "passive" },
    ],
    specs: { maxVoltage: "100V", maxCurrent: "200mA" },
    tags: ["protection", "through-hole", "signal"],
  },
  {
    id: "DIODE_1N4007",
    type: "diode",
    name: "1N4007 Rectifier Diode",
    value: "1N4007",
    package: "DO-41_TH",
    partNumber: "1N4007",
    description: "General-purpose rectifier diode for power circuits. Pin 1 = Anode, Pin 2 = Cathode.",
    pins: [
      { id: "1", name: "Anode", type: "passive" },
      { id: "2", name: "Cathode", type: "passive" },
    ],
    specs: { maxVoltage: "1000V", maxCurrent: "1A" },
    tags: ["protection", "through-hole", "power", "rectifier"],
  },
];

// ─── CONNECTORS ──────────────────────────────────────────────
const connectors: LibraryComponent[] = [
  {
    id: "CONN_USB_C_POWER",
    type: "connector",
    name: "USB-C Power Receptacle (Power Only)",
    value: "USB-C power",
    package: "USB_C_Receptacle",
    partNumber: "USB4125-GF-A",
    description: "USB Type-C receptacle wired for power delivery only (5V). Use VBUS for +5V and GND pins for ground. CC pins need 5.1k pull-down resistors to GND to request 5V.",
    pins: [
      { id: "VBUS", name: "VBUS", type: "power" },
      { id: "GND", name: "GND", type: "ground" },
      { id: "CC1", name: "CC1", type: "signal" },
      { id: "CC2", name: "CC2", type: "signal" },
    ],
    specs: { voltage: "5V", maxCurrent: "3A (with proper CC resistors)" },
    tags: ["connector", "usb", "power", "5v"],
  },
  {
    id: "CONN_PIN_HEADER_2",
    type: "connector",
    name: "2-Pin Header",
    value: "2-pin header",
    package: "PinHeader_1x2_P2.54mm",
    description: "Standard 2.54mm pitch 2-pin header for jumper wires or connections.",
    pins: [
      { id: "1", name: "Pin 1", type: "signal" },
      { id: "2", name: "Pin 2", type: "signal" },
    ],
    tags: ["connector", "through-hole", "header"],
  },
  {
    id: "CONN_PIN_HEADER_4",
    type: "connector",
    name: "4-Pin Header",
    value: "4-pin header",
    package: "PinHeader_1x4_P2.54mm",
    description: "Standard 2.54mm pitch 4-pin header.",
    pins: [
      { id: "1", name: "Pin 1", type: "signal" },
      { id: "2", name: "Pin 2", type: "signal" },
      { id: "3", name: "Pin 3", type: "signal" },
      { id: "4", name: "Pin 4", type: "signal" },
    ],
    tags: ["connector", "through-hole", "header"],
  },
  {
    id: "CONN_BARREL_JACK",
    type: "connector",
    name: "DC Barrel Jack (5.5x2.1mm)",
    value: "DC barrel jack",
    package: "BarrelJack_TH",
    description: "Standard DC barrel jack for wall adapter power input. Tip is positive.",
    pins: [
      { id: "1", name: "Tip (+)", type: "power" },
      { id: "2", name: "Sleeve (-)", type: "ground" },
      { id: "3", name: "Switch", type: "signal" },
    ],
    specs: { innerDiameter: "2.1mm", outerDiameter: "5.5mm" },
    tags: ["connector", "through-hole", "power", "dc"],
  },
  {
    id: "CONN_SCREW_TERM_2",
    type: "connector",
    name: "2-Position Screw Terminal",
    value: "2-pos screw terminal",
    package: "ScrewTerminal_1x2_P5.08mm",
    description: "2-position screw terminal block for wire connections. 5.08mm pitch.",
    pins: [
      { id: "1", name: "Pin 1", type: "signal" },
      { id: "2", name: "Pin 2", type: "signal" },
    ],
    tags: ["connector", "through-hole", "terminal", "power"],
  },
  {
    id: "CONN_JST_PH_3",
    type: "connector",
    name: "JST PH 3-Pin Connector",
    value: "JST-PH 3-pin",
    package: "JST_PH_S3B-PH-K_1x3_P2.00mm",
    partNumber: "S3B-PH-K-S",
    description: "JST PH series 3-pin SMD connector, 2.0mm pitch. Common for small board-to-board and wire-to-board connections (LEDs, sensors, batteries). Pin 1 is typically VCC, pin 2 is data/signal, pin 3 is GND — but assign based on your circuit needs.",
    pins: [
      { id: "1", name: "Pin 1", type: "signal" },
      { id: "2", name: "Pin 2", type: "signal" },
      { id: "3", name: "Pin 3", type: "signal" },
    ],
    specs: { pitch: "2.0mm", ratedCurrent: "2A", ratedVoltage: "100V" },
    tags: ["connector", "smd", "jst", "wire-to-board", "small"],
  },
  {
    id: "CONN_JST_PH_4",
    type: "connector",
    name: "JST PH 4-Pin Connector",
    value: "JST-PH 4-pin",
    package: "JST_PH_S4B-PH-K_1x4_P2.00mm",
    partNumber: "S4B-PH-K-S",
    description: "JST PH series 4-pin SMD connector, 2.0mm pitch. Common for addressable LED strips (VCC, DIN, DOUT, GND) and sensor connections.",
    pins: [
      { id: "1", name: "Pin 1", type: "signal" },
      { id: "2", name: "Pin 2", type: "signal" },
      { id: "3", name: "Pin 3", type: "signal" },
      { id: "4", name: "Pin 4", type: "signal" },
    ],
    specs: { pitch: "2.0mm", ratedCurrent: "2A", ratedVoltage: "100V" },
    tags: ["connector", "smd", "jst", "wire-to-board", "small"],
  },
];

// ─── VOLTAGE REGULATORS ──────────────────────────────────────
const regulators: LibraryComponent[] = [
  {
    id: "REG_AMS1117_3V3",
    type: "regulator",
    name: "AMS1117-3.3V LDO Regulator",
    value: "AMS1117-3.3",
    package: "SOT-223",
    partNumber: "AMS1117-3.3",
    description: "3.3V LDO voltage regulator. Input up to 15V, output 3.3V at up to 1A. Requires 10uF input and output capacitors.",
    pins: [
      { id: "1", name: "GND/Adjust", type: "ground" },
      { id: "2", name: "Vout", type: "power" },
      { id: "3", name: "Vin", type: "power" },
    ],
    specs: { inputVoltage: "4.5V-15V", outputVoltage: "3.3V", maxCurrent: "1A", dropout: "1.3V" },
    tags: ["regulator", "power", "3.3v", "ldo", "smd"],
  },
  {
    id: "REG_7805",
    type: "regulator",
    name: "7805 5V Linear Regulator",
    value: "L7805CV",
    package: "TO-220_TH",
    partNumber: "L7805CV",
    description: "Classic 5V linear regulator. Input 7-35V, output 5V at up to 1.5A. Needs input and output capacitors (0.33uF in, 0.1uF out minimum).",
    pins: [
      { id: "1", name: "Vin", type: "power" },
      { id: "2", name: "GND", type: "ground" },
      { id: "3", name: "Vout", type: "power" },
    ],
    specs: { inputVoltage: "7V-35V", outputVoltage: "5V", maxCurrent: "1.5A" },
    tags: ["regulator", "power", "5v", "linear", "through-hole"],
  },
];

// ─── SWITCHES ────────────────────────────────────────────────
const switches: LibraryComponent[] = [
  {
    id: "SW_TACTILE_6MM",
    type: "switch",
    name: "6mm Tactile Push Button",
    value: "tactile switch",
    package: "SW_Push_6mm_TH",
    description: "Momentary tactile push button switch, 6x6mm. Pins 1-2 are one side, pins 3-4 are the other. Pressing connects pin 1-2 to pin 3-4. Use with a pull-up or pull-down resistor for logic inputs.",
    pins: [
      { id: "1", name: "A1", type: "passive" },
      { id: "2", name: "A2", type: "passive" },
      { id: "3", name: "B1", type: "passive" },
      { id: "4", name: "B2", type: "passive" },
    ],
    tags: ["switch", "through-hole", "input", "momentary"],
  },
  {
    id: "SW_SLIDE_SPDT",
    type: "switch",
    name: "SPDT Slide Switch",
    value: "slide switch",
    package: "SW_Slide_SPDT_TH",
    description: "Single-pole double-throw slide switch. Pin 2 is common, connects to pin 1 or pin 3 depending on slider position. Good for on/off power switching.",
    pins: [
      { id: "1", name: "A", type: "passive" },
      { id: "2", name: "Common", type: "passive" },
      { id: "3", name: "B", type: "passive" },
    ],
    tags: ["switch", "through-hole", "power", "toggle"],
  },
];

// ─── MOSFETS ─────────────────────────────────────────────────
const mosfets: LibraryComponent[] = [
  {
    id: "MOSFET_IRLZ44N",
    type: "mosfet",
    name: "IRLZ44N N-Channel MOSFET",
    value: "IRLZ44N",
    package: "TO-220_TH",
    partNumber: "IRLZ44N",
    description: "Logic-level N-channel MOSFET. Can be driven directly from 3.3V/5V logic. Gate = control, Drain = load, Source = ground. Good for switching LEDs, motors, relays.",
    pins: [
      { id: "1", name: "Gate", type: "signal" },
      { id: "2", name: "Drain", type: "passive" },
      { id: "3", name: "Source", type: "passive" },
    ],
    specs: { vds: "55V", id: "47A", vgsThreshold: "1-2V", rdsOn: "0.022 ohm" },
    tags: ["mosfet", "n-channel", "through-hole", "power", "switching"],
  },
  {
    id: "MOSFET_2N7000",
    type: "mosfet",
    name: "2N7000 N-Channel MOSFET",
    value: "2N7000",
    package: "TO-92_TH",
    partNumber: "2N7000",
    description: "Small-signal N-channel MOSFET in TO-92 package. Good for low-power switching.",
    pins: [
      { id: "1", name: "Source", type: "passive" },
      { id: "2", name: "Gate", type: "signal" },
      { id: "3", name: "Drain", type: "passive" },
    ],
    specs: { vds: "60V", id: "200mA", vgsThreshold: "0.8-3V" },
    tags: ["mosfet", "n-channel", "through-hole", "signal", "small"],
  },
];

// ─── ICs ─────────────────────────────────────────────────────
const ics: LibraryComponent[] = [
  {
    id: "IC_NE555_TH",
    type: "ic",
    name: "NE555 Timer IC",
    value: "NE555",
    package: "DIP-8",
    partNumber: "NE555P",
    description: "Classic 555 timer IC. Can be configured in astable (oscillator) or monostable (one-shot) mode. Requires decoupling cap on VCC.",
    pins: [
      { id: "1", name: "GND", type: "ground" },
      { id: "2", name: "TRIG", type: "signal" },
      { id: "3", name: "OUT", type: "signal" },
      { id: "4", name: "RESET", type: "signal" },
      { id: "5", name: "CTRL", type: "signal" },
      { id: "6", name: "THRES", type: "signal" },
      { id: "7", name: "DISCH", type: "signal" },
      { id: "8", name: "VCC", type: "power" },
    ],
    specs: { supplyVoltage: "4.5V-16V", maxOutputCurrent: "200mA" },
    tags: ["ic", "timer", "through-hole", "oscillator"],
  },
  {
    id: "IC_ATMEGA328P",
    type: "ic",
    name: "ATmega328P Microcontroller",
    value: "ATmega328P",
    package: "DIP-28",
    partNumber: "ATMEGA328P-PU",
    description: "8-bit AVR microcontroller (same as Arduino Uno). Requires 16MHz crystal + 22pF load caps, 100nF decoupling on VCC, and 10k pull-up on RESET.",
    pins: [
      { id: "1", name: "PC6/RESET", type: "signal" },
      { id: "2", name: "PD0/RXD", type: "signal" },
      { id: "3", name: "PD1/TXD", type: "signal" },
      { id: "4", name: "PD2/INT0", type: "signal" },
      { id: "5", name: "PD3/INT1", type: "signal" },
      { id: "6", name: "PD4", type: "signal" },
      { id: "7", name: "VCC", type: "power" },
      { id: "8", name: "GND", type: "ground" },
      { id: "9", name: "PB6/XTAL1", type: "signal" },
      { id: "10", name: "PB7/XTAL2", type: "signal" },
      { id: "11", name: "PD5/OC0B", type: "signal" },
      { id: "12", name: "PD6/OC0A", type: "signal" },
      { id: "13", name: "PD7", type: "signal" },
      { id: "14", name: "PB0", type: "signal" },
      { id: "15", name: "PB1/OC1A", type: "signal" },
      { id: "16", name: "PB2/OC1B", type: "signal" },
      { id: "17", name: "PB3/MOSI", type: "signal" },
      { id: "18", name: "PB4/MISO", type: "signal" },
      { id: "19", name: "PB5/SCK", type: "signal" },
      { id: "20", name: "AVCC", type: "power" },
      { id: "21", name: "AREF", type: "signal" },
      { id: "22", name: "GND", type: "ground" },
      { id: "23", name: "PC0/A0", type: "signal" },
      { id: "24", name: "PC1/A1", type: "signal" },
      { id: "25", name: "PC2/A2", type: "signal" },
      { id: "26", name: "PC3/A3", type: "signal" },
      { id: "27", name: "PC4/A4/SDA", type: "signal" },
      { id: "28", name: "PC5/A5/SCL", type: "signal" },
    ],
    specs: { supplyVoltage: "1.8V-5.5V", flash: "32KB", sram: "2KB", clockSpeed: "up to 20MHz" },
    tags: ["ic", "microcontroller", "through-hole", "avr", "arduino"],
  },
  {
    id: "IC_ESP32_DEVKIT",
    type: "ic",
    name: "ESP32 DevKit Module",
    value: "ESP32-DEVKIT",
    package: "Module_DIP",
    description: "ESP32 development board as a module. WiFi + Bluetooth. 3.3V logic. Can be used as a DIP module on a carrier board. VIN accepts 5V (has onboard regulator).",
    pins: [
      { id: "1", name: "3V3", type: "power" },
      { id: "2", name: "GND", type: "ground" },
      { id: "3", name: "GPIO23/MOSI", type: "signal" },
      { id: "4", name: "GPIO22/SCL", type: "signal" },
      { id: "5", name: "GPIO21/SDA", type: "signal" },
      { id: "6", name: "GPIO19/MISO", type: "signal" },
      { id: "7", name: "GPIO18/SCK", type: "signal" },
      { id: "8", name: "GPIO5", type: "signal" },
      { id: "9", name: "GPIO4", type: "signal" },
      { id: "10", name: "GPIO2", type: "signal" },
      { id: "11", name: "GPIO15", type: "signal" },
      { id: "12", name: "VIN", type: "power" },
      { id: "13", name: "GND2", type: "ground" },
      { id: "14", name: "GPIO13", type: "signal" },
      { id: "15", name: "GPIO12", type: "signal" },
      { id: "16", name: "GPIO14", type: "signal" },
      { id: "17", name: "GPIO27", type: "signal" },
      { id: "18", name: "GPIO26", type: "signal" },
      { id: "19", name: "GPIO25", type: "signal" },
      { id: "20", name: "GPIO33", type: "signal" },
    ],
    specs: { supplyVoltage: "5V (VIN) or 3.3V", wifi: "802.11 b/g/n", bluetooth: "BLE 4.2", flash: "4MB" },
    tags: ["ic", "microcontroller", "wifi", "bluetooth", "esp32", "module"],
  },
];

// ─── ADDRESSABLE LEDS ───────────────────────────────────────
const addressableLeds: LibraryComponent[] = [
  {
    id: "LED_WS2812B",
    type: "ic",
    name: "WS2812B Addressable RGB LED",
    value: "WS2812B",
    package: "LED_SMD_5050",
    partNumber: "WS2812B",
    description: "Individually addressable RGB LED with built-in driver IC. 5050 SMD package (5x5mm). Controlled via a single-wire data protocol. Chain multiple LEDs by connecting DOUT to the next LED's DIN. REQUIRES a 100nF decoupling capacitor between VDD and VSS, placed as close as possible to the LED. VDD is 5V power, VSS is ground.",
    pins: [
      { id: "1", name: "VDD", type: "power" },
      { id: "2", name: "DOUT", type: "signal" },
      { id: "3", name: "VSS", type: "ground" },
      { id: "4", name: "DIN", type: "signal" },
    ],
    specs: { supplyVoltage: "3.5V-5.3V", maxCurrent: "60mA (20mA per color)", protocol: "Single-wire NRZ", dataRate: "800kbps" },
    tags: ["led", "addressable", "rgb", "neopixel", "ws2812", "smd", "5050"],
  },
];

// ─── FULL LIBRARY ────────────────────────────────────────────

export const COMPONENT_LIBRARY: LibraryComponent[] = [
  ...resistors,
  ...capacitors,
  ...leds,
  ...diodes,
  ...connectors,
  ...regulators,
  ...switches,
  ...mosfets,
  ...ics,
  ...addressableLeds,
];

/**
 * Look up a component by its library ID.
 */
export function getComponent(id: string): LibraryComponent | undefined {
  return COMPONENT_LIBRARY.find((c) => c.id === id);
}

/**
 * Find components matching a search query (checks name, description, tags).
 */
export function searchComponents(query: string): LibraryComponent[] {
  const q = query.toLowerCase();
  return COMPONENT_LIBRARY.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q) ||
      c.tags.some((t) => t.includes(q)) ||
      c.type.includes(q)
  );
}

/**
 * Get all components of a given type.
 */
export function getComponentsByType(type: LibraryComponent["type"]): LibraryComponent[] {
  return COMPONENT_LIBRARY.filter((c) => c.type === type);
}

/**
 * Format the library as a compact string for inclusion in the system prompt.
 * Groups by type and includes pin definitions.
 */
export function formatLibraryForPrompt(): string {
  const grouped = new Map<string, LibraryComponent[]>();
  for (const comp of COMPONENT_LIBRARY) {
    const list = grouped.get(comp.type) || [];
    list.push(comp);
    grouped.set(comp.type, list);
  }

  const lines: string[] = [];
  for (const [type, comps] of grouped) {
    lines.push(`\n### ${type.toUpperCase()}S`);
    for (const c of comps) {
      const pinStr = c.pins.map((p) => `${p.id}:${p.name}(${p.type})`).join(", ");
      lines.push(`- **${c.id}**: ${c.name} [${c.package}]`);
      lines.push(`  Pins: ${pinStr}`);
      if (c.partNumber) lines.push(`  MPN: ${c.partNumber}`);
      if (c.specs) {
        const specStr = Object.entries(c.specs).map(([k, v]) => `${k}=${v}`).join(", ");
        lines.push(`  Specs: ${specStr}`);
      }
      lines.push(`  ${c.description}`);
    }
  }

  return lines.join("\n");
}
