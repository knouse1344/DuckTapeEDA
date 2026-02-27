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

// ─── SENSORS ────────────────────────────────────────────────
const sensors: LibraryComponent[] = [
  {
    id: "SENSOR_DHT22",
    type: "ic",
    name: "DHT22 Temperature & Humidity Sensor",
    value: "DHT22",
    package: "SIP-4_TH",
    partNumber: "AM2302",
    description: "Digital temperature and humidity sensor. Single-wire data protocol. Requires a 10k pull-up resistor on the DATA pin to VCC. Pin 3 is not connected.",
    pins: [
      { id: "1", name: "VCC", type: "power" },
      { id: "2", name: "DATA", type: "signal" },
      { id: "3", name: "NC", type: "signal" },
      { id: "4", name: "GND", type: "ground" },
    ],
    specs: { supplyVoltage: "3.3V-5V", tempRange: "-40°C to 80°C", humidityRange: "0-100%", accuracy: "±0.5°C, ±2%RH" },
    tags: ["sensor", "temperature", "humidity", "through-hole", "digital", "iot"],
  },
  {
    id: "SENSOR_BME280",
    type: "ic",
    name: "BME280 Temp/Humidity/Pressure Sensor Module",
    value: "BME280",
    package: "Module_4pin",
    partNumber: "BME280",
    description: "I2C temperature, humidity, and barometric pressure sensor breakout module. 4-pin header: VIN, GND, SCL, SDA. 3.3V or 5V (has onboard regulator). I2C address 0x76 or 0x77.",
    pins: [
      { id: "1", name: "VIN", type: "power" },
      { id: "2", name: "GND", type: "ground" },
      { id: "3", name: "SCL", type: "signal" },
      { id: "4", name: "SDA", type: "signal" },
    ],
    specs: { supplyVoltage: "3.3V-5V", interface: "I2C", tempRange: "-40°C to 85°C", pressureRange: "300-1100 hPa" },
    tags: ["sensor", "temperature", "humidity", "pressure", "i2c", "module", "iot", "weather"],
  },
  {
    id: "SENSOR_MPU6050",
    type: "ic",
    name: "MPU-6050 Accelerometer & Gyroscope Module",
    value: "MPU-6050",
    package: "Module_8pin",
    partNumber: "MPU-6050",
    description: "6-axis motion sensor module (3-axis accelerometer + 3-axis gyroscope) with I2C interface. Commonly used GY-521 breakout. I2C address 0x68 (AD0 low) or 0x69 (AD0 high). INT is optional interrupt output.",
    pins: [
      { id: "1", name: "VCC", type: "power" },
      { id: "2", name: "GND", type: "ground" },
      { id: "3", name: "SCL", type: "signal" },
      { id: "4", name: "SDA", type: "signal" },
      { id: "5", name: "XDA", type: "signal" },
      { id: "6", name: "XCL", type: "signal" },
      { id: "7", name: "AD0", type: "signal" },
      { id: "8", name: "INT", type: "signal" },
    ],
    specs: { supplyVoltage: "3.3V-5V", interface: "I2C", accelRange: "±2/4/8/16g", gyroRange: "±250/500/1000/2000°/s" },
    tags: ["sensor", "accelerometer", "gyroscope", "imu", "motion", "i2c", "module", "iot"],
  },
  {
    id: "SENSOR_HC_SR04",
    type: "ic",
    name: "HC-SR04 Ultrasonic Distance Sensor",
    value: "HC-SR04",
    package: "Module_4pin",
    partNumber: "HC-SR04",
    description: "Ultrasonic distance sensor module. Send a 10us pulse on TRIG, measure the pulse width on ECHO to calculate distance. Works at 5V; if using with 3.3V MCU, use a voltage divider on ECHO pin.",
    pins: [
      { id: "1", name: "VCC", type: "power" },
      { id: "2", name: "TRIG", type: "signal" },
      { id: "3", name: "ECHO", type: "signal" },
      { id: "4", name: "GND", type: "ground" },
    ],
    specs: { supplyVoltage: "5V", range: "2cm-400cm", resolution: "3mm", triggerPulse: "10us" },
    tags: ["sensor", "ultrasonic", "distance", "ranging", "module", "5v"],
  },
  {
    id: "SENSOR_PHOTORESISTOR",
    type: "resistor",
    name: "Photoresistor (LDR)",
    value: "photoresistor",
    package: "LDR_TH",
    description: "Light-dependent resistor. Resistance decreases with increasing light (bright: ~1k, dark: ~100k+). Use in a voltage divider with a fixed resistor (e.g. 10k) to read analog light levels.",
    pins: [
      { id: "1", name: "1", type: "passive" },
      { id: "2", name: "2", type: "passive" },
    ],
    specs: { darkResistance: ">100k ohm", lightResistance: "~1k ohm" },
    tags: ["sensor", "light", "analog", "through-hole", "ldr", "passive"],
  },
  {
    id: "SENSOR_IR_RECEIVER",
    type: "ic",
    name: "TSOP38238 IR Receiver",
    value: "TSOP38238",
    package: "TO-92_TH",
    partNumber: "TSOP38238",
    description: "38kHz infrared receiver for remote control signals (NEC, RC5, etc.). Output goes LOW when IR signal is received. Requires 100nF decoupling cap on VCC.",
    pins: [
      { id: "1", name: "OUT", type: "signal" },
      { id: "2", name: "GND", type: "ground" },
      { id: "3", name: "VCC", type: "power" },
    ],
    specs: { supplyVoltage: "2.5V-5.5V", carrierFrequency: "38kHz", range: "up to 45m" },
    tags: ["sensor", "ir", "infrared", "remote", "receiver", "through-hole"],
  },
  {
    id: "SENSOR_PIR",
    type: "ic",
    name: "HC-SR501 PIR Motion Sensor",
    value: "HC-SR501",
    package: "Module_3pin",
    partNumber: "HC-SR501",
    description: "Passive infrared motion sensor module. Output pin goes HIGH when motion is detected. Has onboard potentiometers for sensitivity and delay adjustment. Wide detection angle.",
    pins: [
      { id: "1", name: "VCC", type: "power" },
      { id: "2", name: "OUT", type: "signal" },
      { id: "3", name: "GND", type: "ground" },
    ],
    specs: { supplyVoltage: "5V-20V", outputVoltage: "3.3V", range: "up to 7m", angle: "110°" },
    tags: ["sensor", "motion", "pir", "infrared", "security", "module", "iot"],
  },
];

// ─── COMMUNICATION MODULES ──────────────────────────────────
const comms: LibraryComponent[] = [
  {
    id: "COMM_NRF24L01",
    type: "ic",
    name: "NRF24L01+ 2.4GHz Wireless Module",
    value: "NRF24L01+",
    package: "Module_8pin",
    partNumber: "NRF24L01+",
    description: "2.4GHz wireless transceiver module with SPI interface. 3.3V only — do NOT connect VCC to 5V. Range up to 100m (with external antenna version). CE and CSN are chip control pins.",
    pins: [
      { id: "1", name: "GND", type: "ground" },
      { id: "2", name: "VCC", type: "power" },
      { id: "3", name: "CE", type: "signal" },
      { id: "4", name: "CSN", type: "signal" },
      { id: "5", name: "SCK", type: "signal" },
      { id: "6", name: "MOSI", type: "signal" },
      { id: "7", name: "MISO", type: "signal" },
      { id: "8", name: "IRQ", type: "signal" },
    ],
    specs: { supplyVoltage: "1.9V-3.6V (3.3V typical)", frequency: "2.4GHz ISM", dataRate: "250kbps/1Mbps/2Mbps", range: "100m+" },
    tags: ["wireless", "radio", "2.4ghz", "spi", "module", "iot", "3.3v"],
  },
  {
    id: "COMM_RFM95W",
    type: "ic",
    name: "RFM95W LoRa Module (915MHz)",
    value: "RFM95W",
    package: "Module_16pin",
    partNumber: "RFM95W-915S2",
    description: "LoRa long-range wireless module operating at 915MHz (US) with SPI interface. 3.3V only. Range up to 10km line-of-sight. Requires antenna connection. DIO0-DIO5 are configurable interrupt outputs.",
    pins: [
      { id: "1", name: "GND", type: "ground" },
      { id: "2", name: "MISO", type: "signal" },
      { id: "3", name: "MOSI", type: "signal" },
      { id: "4", name: "SCK", type: "signal" },
      { id: "5", name: "NSS", type: "signal" },
      { id: "6", name: "RESET", type: "signal" },
      { id: "7", name: "DIO0", type: "signal" },
      { id: "8", name: "DIO1", type: "signal" },
      { id: "9", name: "DIO2", type: "signal" },
      { id: "10", name: "DIO3", type: "signal" },
      { id: "11", name: "DIO4", type: "signal" },
      { id: "12", name: "DIO5", type: "signal" },
      { id: "13", name: "3V3", type: "power" },
      { id: "14", name: "GND2", type: "ground" },
      { id: "15", name: "ANT", type: "signal" },
      { id: "16", name: "GND3", type: "ground" },
    ],
    specs: { supplyVoltage: "1.8V-3.7V (3.3V typical)", frequency: "915MHz", sensitivity: "-148dBm", range: "10km+" },
    tags: ["wireless", "lora", "915mhz", "long-range", "spi", "module", "iot", "3.3v"],
  },
  {
    id: "COMM_HC05",
    type: "ic",
    name: "HC-05 Bluetooth Serial Module",
    value: "HC-05",
    package: "Module_6pin",
    partNumber: "HC-05",
    description: "Classic Bluetooth 2.0 serial port module. Default baud rate 9600. Communicates via UART (TX/RX). 3.3V logic but VCC accepts 3.6V-6V (has onboard regulator). STATE pin indicates connection status. EN/KEY pin for AT command mode.",
    pins: [
      { id: "1", name: "EN/KEY", type: "signal" },
      { id: "2", name: "VCC", type: "power" },
      { id: "3", name: "GND", type: "ground" },
      { id: "4", name: "TXD", type: "signal" },
      { id: "5", name: "RXD", type: "signal" },
      { id: "6", name: "STATE", type: "signal" },
    ],
    specs: { supplyVoltage: "3.6V-6V", bluetooth: "2.0+EDR", baudRate: "9600 default", range: "10m" },
    tags: ["wireless", "bluetooth", "uart", "serial", "module", "iot"],
  },
];

// ─── POWER MANAGEMENT ───────────────────────────────────────
const power: LibraryComponent[] = [
  {
    id: "PWR_TP4056",
    type: "ic",
    name: "TP4056 LiPo Battery Charger Module",
    value: "TP4056",
    package: "Module_6pin",
    partNumber: "TP4056",
    description: "Single-cell LiPo/Li-Ion battery charger module with micro-USB input and built-in protection circuit (DW01A + 8205A). Charges at up to 1A. CHRG LED indicates charging, STDBY LED indicates full. B+ and B- connect to battery, OUT+ and OUT- provide protected output.",
    pins: [
      { id: "1", name: "IN+", type: "power" },
      { id: "2", name: "IN-", type: "ground" },
      { id: "3", name: "B+", type: "power" },
      { id: "4", name: "B-", type: "ground" },
      { id: "5", name: "OUT+", type: "power" },
      { id: "6", name: "OUT-", type: "ground" },
    ],
    specs: { inputVoltage: "5V (micro-USB or pads)", chargeCurrent: "1A (adjustable via Rprog)", batteryVoltage: "4.2V", cutoff: "2.5V" },
    tags: ["power", "charger", "lipo", "battery", "module", "usb", "iot"],
  },
  {
    id: "PWR_MT3608",
    type: "ic",
    name: "MT3608 Boost Converter Module",
    value: "MT3608",
    package: "Module_4pin",
    partNumber: "MT3608",
    description: "Adjustable DC-DC step-up (boost) converter module. Adjusts output voltage with onboard potentiometer. Input 2V-24V, output up to 28V at 2A. Useful for boosting 3.7V LiPo to 5V or 12V.",
    pins: [
      { id: "1", name: "VIN+", type: "power" },
      { id: "2", name: "VIN-", type: "ground" },
      { id: "3", name: "VOUT+", type: "power" },
      { id: "4", name: "VOUT-", type: "ground" },
    ],
    specs: { inputVoltage: "2V-24V", outputVoltage: "5V-28V (adjustable)", maxCurrent: "2A", efficiency: "93%" },
    tags: ["power", "boost", "dc-dc", "step-up", "module", "battery"],
  },
  {
    id: "PWR_BATTERY_HOLDER_AA_2",
    type: "connector",
    name: "2xAA Battery Holder",
    value: "2xAA battery holder",
    package: "BatteryHolder_2xAA",
    description: "Holder for 2 AA batteries in series (3V total). Wire leads connect to board. Positive wire to power net, negative to GND.",
    pins: [
      { id: "1", name: "+", type: "power" },
      { id: "2", name: "-", type: "ground" },
    ],
    specs: { voltage: "3V (2x1.5V)", chemistry: "Alkaline or NiMH" },
    tags: ["power", "battery", "holder", "aa", "3v"],
  },
  {
    id: "PWR_BATTERY_HOLDER_18650",
    type: "connector",
    name: "18650 Battery Holder",
    value: "18650 battery holder",
    package: "BatteryHolder_18650",
    description: "Single 18650 lithium-ion cell holder. Provides 3.7V nominal. Use with TP4056 charger and boost converter for portable projects.",
    pins: [
      { id: "1", name: "+", type: "power" },
      { id: "2", name: "-", type: "ground" },
    ],
    specs: { voltage: "3.7V nominal (4.2V full, 3.0V empty)", chemistry: "Li-Ion" },
    tags: ["power", "battery", "holder", "18650", "lithium", "portable"],
  },
  {
    id: "PWR_FUSE_RESETTABLE",
    type: "resistor",
    name: "Resettable Fuse (PTC)",
    value: "500mA polyfuse",
    package: "Radial_TH",
    description: "Resettable PTC fuse for overcurrent protection. Trips at rated current and resets when power is removed. Place in series on the power input line.",
    pins: [
      { id: "1", name: "1", type: "passive" },
      { id: "2", name: "2", type: "passive" },
    ],
    specs: { holdCurrent: "500mA", tripCurrent: "1A", maxVoltage: "16V" },
    tags: ["protection", "fuse", "ptc", "resettable", "through-hole", "power"],
  },
];

// ─── DISPLAYS ───────────────────────────────────────────────
const displays: LibraryComponent[] = [
  {
    id: "DISP_SSD1306_OLED",
    type: "ic",
    name: "SSD1306 0.96\" OLED Display Module (I2C)",
    value: "SSD1306 OLED",
    package: "Module_4pin",
    partNumber: "SSD1306",
    description: "128x64 pixel monochrome OLED display with I2C interface. 4-pin module (VCC, GND, SCL, SDA). I2C address typically 0x3C. Works at 3.3V or 5V. Very low power consumption.",
    pins: [
      { id: "1", name: "VCC", type: "power" },
      { id: "2", name: "GND", type: "ground" },
      { id: "3", name: "SCL", type: "signal" },
      { id: "4", name: "SDA", type: "signal" },
    ],
    specs: { supplyVoltage: "3.3V-5V", resolution: "128x64", interface: "I2C (0x3C)", color: "white or blue" },
    tags: ["display", "oled", "ssd1306", "i2c", "module", "iot", "128x64"],
  },
  {
    id: "DISP_LCD_1602_I2C",
    type: "ic",
    name: "LCD 1602 Display with I2C Backpack",
    value: "LCD 1602 I2C",
    package: "Module_4pin",
    partNumber: "PCF8574T",
    description: "16x2 character LCD with I2C adapter (PCF8574). Only needs 4 wires instead of 16. I2C address typically 0x27 or 0x3F. Onboard potentiometer for contrast adjustment.",
    pins: [
      { id: "1", name: "VCC", type: "power" },
      { id: "2", name: "GND", type: "ground" },
      { id: "3", name: "SDA", type: "signal" },
      { id: "4", name: "SCL", type: "signal" },
    ],
    specs: { supplyVoltage: "5V", characters: "16x2", interface: "I2C", backlight: "yes" },
    tags: ["display", "lcd", "1602", "i2c", "module", "16x2"],
  },
];

// ─── AUDIO ──────────────────────────────────────────────────
const audio: LibraryComponent[] = [
  {
    id: "AUDIO_PIEZO_BUZZER",
    type: "ic",
    name: "Piezo Buzzer (Active)",
    value: "piezo buzzer",
    package: "Buzzer_12mm_TH",
    description: "Active piezo buzzer — apply DC voltage and it beeps at a fixed frequency. No oscillator circuit needed. Pin 1 (+) is longer lead. Drive directly from a GPIO pin or through a transistor for louder output.",
    pins: [
      { id: "1", name: "+", type: "passive" },
      { id: "2", name: "-", type: "passive" },
    ],
    specs: { supplyVoltage: "3V-5V", frequency: "2.3kHz", soundLevel: "85dB at 10cm" },
    tags: ["audio", "buzzer", "piezo", "active", "through-hole", "alarm"],
  },
  {
    id: "AUDIO_PASSIVE_BUZZER",
    type: "ic",
    name: "Passive Piezo Buzzer",
    value: "passive buzzer",
    package: "Buzzer_12mm_TH",
    description: "Passive piezo buzzer — requires a square wave signal (PWM) to produce sound. Can play different tones/melodies by varying the frequency. Pin 1 (+) is longer lead.",
    pins: [
      { id: "1", name: "+", type: "passive" },
      { id: "2", name: "-", type: "passive" },
    ],
    specs: { supplyVoltage: "3V-5V", frequencyRange: "1kHz-5kHz", soundLevel: "85dB at 10cm" },
    tags: ["audio", "buzzer", "piezo", "passive", "through-hole", "tone", "pwm"],
  },
];

// ─── MOTOR DRIVERS ──────────────────────────────────────────
const motorDrivers: LibraryComponent[] = [
  {
    id: "MOTOR_DRV8833",
    type: "ic",
    name: "DRV8833 Dual H-Bridge Motor Driver Module",
    value: "DRV8833",
    package: "Module_10pin",
    partNumber: "DRV8833",
    description: "Dual H-bridge motor driver for 2 DC motors or 1 stepper motor. 2.7V-10.8V motor voltage, 1.5A per channel (2A peak). EEP pin enables/disables outputs. ULT/FLT is fault output. Low-power sleep mode.",
    pins: [
      { id: "1", name: "EEP", type: "signal" },
      { id: "2", name: "OUT1", type: "signal" },
      { id: "3", name: "OUT2", type: "signal" },
      { id: "4", name: "OUT3", type: "signal" },
      { id: "5", name: "OUT4", type: "signal" },
      { id: "6", name: "VCC", type: "power" },
      { id: "7", name: "GND", type: "ground" },
      { id: "8", name: "IN1", type: "signal" },
      { id: "9", name: "IN2", type: "signal" },
      { id: "10", name: "IN3", type: "signal" },
      { id: "11", name: "IN4", type: "signal" },
      { id: "12", name: "ULT/FLT", type: "signal" },
    ],
    specs: { motorVoltage: "2.7V-10.8V", currentPerChannel: "1.5A (2A peak)", channels: "2 DC or 1 stepper" },
    tags: ["motor", "driver", "h-bridge", "dc-motor", "stepper", "module", "iot"],
  },
  {
    id: "MOTOR_TB6612FNG",
    type: "ic",
    name: "TB6612FNG Dual Motor Driver Module",
    value: "TB6612FNG",
    package: "Module_16pin",
    partNumber: "TB6612FNG",
    description: "Dual H-bridge motor driver, higher performance than L298N with lower voltage drop. Drives 2 DC motors or 1 stepper. STBY pin must be HIGH for operation. PWM inputs control speed, IN pins control direction.",
    pins: [
      { id: "1", name: "VM", type: "power" },
      { id: "2", name: "VCC", type: "power" },
      { id: "3", name: "GND", type: "ground" },
      { id: "4", name: "AO1", type: "signal" },
      { id: "5", name: "AO2", type: "signal" },
      { id: "6", name: "BO1", type: "signal" },
      { id: "7", name: "BO2", type: "signal" },
      { id: "8", name: "AIN1", type: "signal" },
      { id: "9", name: "AIN2", type: "signal" },
      { id: "10", name: "BIN1", type: "signal" },
      { id: "11", name: "BIN2", type: "signal" },
      { id: "12", name: "PWMA", type: "signal" },
      { id: "13", name: "PWMB", type: "signal" },
      { id: "14", name: "STBY", type: "signal" },
      { id: "15", name: "GND2", type: "ground" },
      { id: "16", name: "GND3", type: "ground" },
    ],
    specs: { motorVoltage: "4.5V-13.5V", logicVoltage: "2.7V-5.5V", currentPerChannel: "1.2A (3A peak)", channels: "2 DC or 1 stepper" },
    tags: ["motor", "driver", "h-bridge", "dc-motor", "stepper", "module"],
  },
];

// ─── MORE MCUs / DEV BOARDS ─────────────────────────────────
const moreMcus: LibraryComponent[] = [
  {
    id: "IC_RP2040_PICO",
    type: "ic",
    name: "Raspberry Pi Pico (RP2040)",
    value: "Raspberry Pi Pico",
    package: "Module_DIP_40pin",
    description: "RP2040-based development board. Dual-core ARM Cortex-M0+ at 133MHz. 26 GPIO pins, 3 ADC inputs, 2 SPI, 2 I2C, 2 UART, 16 PWM channels. USB-C for programming and power. VBUS provides 5V from USB, 3V3 is regulated output.",
    pins: [
      { id: "1", name: "GP0", type: "signal" },
      { id: "2", name: "GP1", type: "signal" },
      { id: "3", name: "GND", type: "ground" },
      { id: "4", name: "GP2", type: "signal" },
      { id: "5", name: "GP3", type: "signal" },
      { id: "6", name: "GP4/SDA0", type: "signal" },
      { id: "7", name: "GP5/SCL0", type: "signal" },
      { id: "8", name: "GND2", type: "ground" },
      { id: "9", name: "GP6", type: "signal" },
      { id: "10", name: "GP7", type: "signal" },
      { id: "11", name: "GP8", type: "signal" },
      { id: "12", name: "GP9", type: "signal" },
      { id: "13", name: "GND3", type: "ground" },
      { id: "14", name: "GP10/SPI1_SCK", type: "signal" },
      { id: "15", name: "GP11/SPI1_TX", type: "signal" },
      { id: "16", name: "GP12/SPI1_RX", type: "signal" },
      { id: "17", name: "GP13/SPI1_CS", type: "signal" },
      { id: "18", name: "GND4", type: "ground" },
      { id: "19", name: "GP14", type: "signal" },
      { id: "20", name: "GP15", type: "signal" },
      { id: "21", name: "GP16/SPI0_RX", type: "signal" },
      { id: "22", name: "GP17/SPI0_CS", type: "signal" },
      { id: "23", name: "GND5", type: "ground" },
      { id: "24", name: "GP18/SPI0_SCK", type: "signal" },
      { id: "25", name: "GP19/SPI0_TX", type: "signal" },
      { id: "26", name: "GP20", type: "signal" },
      { id: "27", name: "GP21", type: "signal" },
      { id: "28", name: "GND6", type: "ground" },
      { id: "29", name: "GP22", type: "signal" },
      { id: "30", name: "RUN", type: "signal" },
      { id: "31", name: "GP26/ADC0", type: "signal" },
      { id: "32", name: "GP27/ADC1", type: "signal" },
      { id: "33", name: "GND7", type: "ground" },
      { id: "34", name: "GP28/ADC2", type: "signal" },
      { id: "35", name: "ADC_VREF", type: "power" },
      { id: "36", name: "3V3", type: "power" },
      { id: "37", name: "3V3_EN", type: "signal" },
      { id: "38", name: "GND8", type: "ground" },
      { id: "39", name: "VSYS", type: "power" },
      { id: "40", name: "VBUS", type: "power" },
    ],
    specs: { processor: "Dual-core ARM Cortex-M0+ @ 133MHz", flash: "2MB", sram: "264KB", gpio: "26", supplyVoltage: "1.8V-5.5V (VSYS)" },
    tags: ["ic", "microcontroller", "rp2040", "pico", "arm", "module", "usb-c"],
  },
  {
    id: "IC_ARDUINO_NANO",
    type: "ic",
    name: "Arduino Nano",
    value: "Arduino Nano",
    package: "Module_DIP_30pin",
    description: "Arduino Nano development board (ATmega328P). 14 digital I/O pins, 8 analog inputs, UART, SPI, I2C. Mini-USB for programming and 5V power. VIN accepts 7-12V. Breadboard-friendly DIP form factor.",
    pins: [
      { id: "1", name: "D13/SCK", type: "signal" },
      { id: "2", name: "3V3", type: "power" },
      { id: "3", name: "AREF", type: "signal" },
      { id: "4", name: "A0", type: "signal" },
      { id: "5", name: "A1", type: "signal" },
      { id: "6", name: "A2", type: "signal" },
      { id: "7", name: "A3", type: "signal" },
      { id: "8", name: "A4/SDA", type: "signal" },
      { id: "9", name: "A5/SCL", type: "signal" },
      { id: "10", name: "A6", type: "signal" },
      { id: "11", name: "A7", type: "signal" },
      { id: "12", name: "5V", type: "power" },
      { id: "13", name: "RESET", type: "signal" },
      { id: "14", name: "GND", type: "ground" },
      { id: "15", name: "VIN", type: "power" },
      { id: "16", name: "D0/RX", type: "signal" },
      { id: "17", name: "D1/TX", type: "signal" },
      { id: "18", name: "D2", type: "signal" },
      { id: "19", name: "D3/PWM", type: "signal" },
      { id: "20", name: "D4", type: "signal" },
      { id: "21", name: "D5/PWM", type: "signal" },
      { id: "22", name: "D6/PWM", type: "signal" },
      { id: "23", name: "D7", type: "signal" },
      { id: "24", name: "D8", type: "signal" },
      { id: "25", name: "D9/PWM", type: "signal" },
      { id: "26", name: "D10/PWM/SS", type: "signal" },
      { id: "27", name: "D11/PWM/MOSI", type: "signal" },
      { id: "28", name: "D12/MISO", type: "signal" },
      { id: "29", name: "D13/SCK", type: "signal" },
      { id: "30", name: "GND2", type: "ground" },
    ],
    specs: { processor: "ATmega328P @ 16MHz", flash: "32KB", sram: "2KB", gpio: "22", supplyVoltage: "5V USB or 7-12V VIN" },
    tags: ["ic", "microcontroller", "arduino", "nano", "avr", "module", "breadboard"],
  },
];

// ─── MISC PASSIVES ──────────────────────────────────────────
const miscPassives: LibraryComponent[] = [
  {
    id: "CRYSTAL_16MHZ",
    type: "ic",
    name: "16MHz Crystal Oscillator",
    value: "16MHz crystal",
    package: "HC49_TH",
    description: "16MHz quartz crystal for ATmega328P and other MCUs. Requires two 22pF load capacitors from each pin to GND.",
    pins: [
      { id: "1", name: "1", type: "passive" },
      { id: "2", name: "2", type: "passive" },
    ],
    specs: { frequency: "16MHz", loadCapacitance: "22pF", tolerance: "±20ppm" },
    tags: ["crystal", "oscillator", "16mhz", "through-hole", "clock"],
  },
  {
    id: "POT_10K_TH",
    type: "resistor",
    name: "10k Potentiometer",
    value: "10k potentiometer",
    package: "Potentiometer_TH",
    description: "10k ohm single-turn rotary potentiometer. Pin 1 and 3 are the ends of the resistive element, Pin 2 is the wiper (output). Use as a voltage divider for analog input or volume control.",
    pins: [
      { id: "1", name: "End A", type: "passive" },
      { id: "2", name: "Wiper", type: "passive" },
      { id: "3", name: "End B", type: "passive" },
    ],
    specs: { resistance: "10k ohm", taper: "linear (B)", power: "0.1W" },
    tags: ["passive", "potentiometer", "variable", "through-hole", "analog", "input"],
  },
  {
    id: "DIODE_SCHOTTKY_1N5819",
    type: "diode",
    name: "1N5819 Schottky Diode",
    value: "1N5819",
    package: "DO-41_TH",
    partNumber: "1N5819",
    description: "Schottky barrier diode with low forward voltage drop (0.45V). Good for reverse polarity protection and power OR-ing circuits. Pin 1 = Anode, Pin 2 = Cathode.",
    pins: [
      { id: "1", name: "Anode", type: "passive" },
      { id: "2", name: "Cathode", type: "passive" },
    ],
    specs: { maxVoltage: "40V", maxCurrent: "1A", forwardDrop: "0.45V" },
    tags: ["diode", "schottky", "protection", "through-hole", "low-drop"],
  },
  {
    id: "TVS_SMBJ5V0A",
    type: "diode",
    name: "TVS Diode (5V)",
    value: "SMBJ5.0A",
    package: "SMB",
    partNumber: "SMBJ5.0A",
    description: "Transient voltage suppressor diode for ESD and surge protection on 5V power rails. Place across power input (Cathode to VCC, Anode to GND). Clamps voltage spikes to safe levels.",
    pins: [
      { id: "1", name: "Anode", type: "passive" },
      { id: "2", name: "Cathode", type: "passive" },
    ],
    specs: { standoffVoltage: "5V", clampVoltage: "9.2V", peakPulseCurrent: "43A" },
    tags: ["diode", "tvs", "protection", "esd", "surge", "smd"],
  },
  {
    id: "CONN_PIN_HEADER_6",
    type: "connector",
    name: "6-Pin Header",
    value: "6-pin header",
    package: "PinHeader_1x6_P2.54mm",
    description: "Standard 2.54mm pitch 6-pin header. Commonly used for FTDI/serial programming connections.",
    pins: [
      { id: "1", name: "Pin 1", type: "signal" },
      { id: "2", name: "Pin 2", type: "signal" },
      { id: "3", name: "Pin 3", type: "signal" },
      { id: "4", name: "Pin 4", type: "signal" },
      { id: "5", name: "Pin 5", type: "signal" },
      { id: "6", name: "Pin 6", type: "signal" },
    ],
    tags: ["connector", "through-hole", "header", "serial", "programming"],
  },
  {
    id: "IC_74HC595",
    type: "ic",
    name: "74HC595 Shift Register",
    value: "74HC595",
    package: "DIP-16",
    partNumber: "SN74HC595N",
    description: "8-bit serial-in, parallel-out shift register with output latch. Expands MCU GPIO — control 8 outputs with just 3 pins (SER, SRCLK, RCLK). Cascade multiple chips via QH' serial output. OE (active LOW) enables outputs.",
    pins: [
      { id: "1", name: "QB", type: "signal" },
      { id: "2", name: "QC", type: "signal" },
      { id: "3", name: "QD", type: "signal" },
      { id: "4", name: "QE", type: "signal" },
      { id: "5", name: "QF", type: "signal" },
      { id: "6", name: "QG", type: "signal" },
      { id: "7", name: "QH", type: "signal" },
      { id: "8", name: "GND", type: "ground" },
      { id: "9", name: "QH'", type: "signal" },
      { id: "10", name: "SRCLR", type: "signal" },
      { id: "11", name: "SRCLK", type: "signal" },
      { id: "12", name: "RCLK", type: "signal" },
      { id: "13", name: "OE", type: "signal" },
      { id: "14", name: "SER", type: "signal" },
      { id: "15", name: "QA", type: "signal" },
      { id: "16", name: "VCC", type: "power" },
    ],
    specs: { supplyVoltage: "2V-6V", outputCurrent: "6mA per pin", shiftFrequency: "up to 25MHz" },
    tags: ["ic", "shift-register", "gpio-expander", "spi", "through-hole"],
  },
  {
    id: "IC_PCF8574",
    type: "ic",
    name: "PCF8574 I2C GPIO Expander",
    value: "PCF8574",
    package: "DIP-16",
    partNumber: "PCF8574N",
    description: "8-bit I2C I/O expander. Adds 8 GPIO pins over I2C bus. Address set by A0-A2 pins (8 addresses: 0x20-0x27). INT output triggers on any pin change. Each pin can be input or output.",
    pins: [
      { id: "1", name: "A0", type: "signal" },
      { id: "2", name: "A1", type: "signal" },
      { id: "3", name: "A2", type: "signal" },
      { id: "4", name: "P0", type: "signal" },
      { id: "5", name: "P1", type: "signal" },
      { id: "6", name: "P2", type: "signal" },
      { id: "7", name: "P3", type: "signal" },
      { id: "8", name: "GND", type: "ground" },
      { id: "9", name: "P4", type: "signal" },
      { id: "10", name: "P5", type: "signal" },
      { id: "11", name: "P6", type: "signal" },
      { id: "12", name: "P7", type: "signal" },
      { id: "13", name: "INT", type: "signal" },
      { id: "14", name: "SCL", type: "signal" },
      { id: "15", name: "SDA", type: "signal" },
      { id: "16", name: "VCC", type: "power" },
    ],
    specs: { supplyVoltage: "2.5V-6V", interface: "I2C", sinkCurrent: "25mA per pin", addresses: "0x20-0x27" },
    tags: ["ic", "gpio-expander", "i2c", "through-hole"],
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
  ...sensors,
  ...comms,
  ...power,
  ...displays,
  ...audio,
  ...motorDrivers,
  ...moreMcus,
  ...miscPassives,
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
