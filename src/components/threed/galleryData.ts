import type { Component } from "../../types/circuit";

export interface GalleryItem {
  label: string;
  comp: Component;
}

/** Minimal position stub — not used for rendering, but required by type */
const POS = { x: 0, y: 0, rotation: 0 };

/** Minimal pin stub */
const pin = (id: string, name: string): Component["pins"][number] => ({
  id,
  name,
  type: "passive",
});

/**
 * One entry per builder dispatch path so every 3D model can be visually
 * verified in the dev gallery.
 */
export const GALLERY_ITEMS: GalleryItem[] = [
  // ── Type-based (switch on comp.type) ────────────────────────
  {
    label: "Resistor (THT)",
    comp: {
      ref: "R1",
      type: "resistor",
      value: "10kΩ",
      package: "Axial-0.4",
      description: "10k through-hole resistor",
      pins: [pin("1", "1"), pin("2", "2")],
      schematicPosition: POS,
      pcbPosition: POS,
    },
  },
  {
    label: "Resistor (SMD 0805)",
    comp: {
      ref: "R2",
      type: "resistor",
      value: "4.7kΩ",
      package: "0805",
      description: "4.7k SMD resistor",
      pins: [pin("1", "1"), pin("2", "2")],
      schematicPosition: POS,
      pcbPosition: POS,
    },
  },
  {
    label: "LED (THT)",
    comp: {
      ref: "D1",
      type: "led",
      value: "Red LED",
      package: "LED-5mm",
      description: "5mm through-hole red LED",
      pins: [pin("A", "Anode"), pin("K", "Cathode")],
      schematicPosition: POS,
      pcbPosition: POS,
    },
  },
  {
    label: "LED (SMD 0805)",
    comp: {
      ref: "D2",
      type: "led",
      value: "Green LED",
      package: "0805",
      description: "SMD green LED",
      pins: [pin("A", "Anode"), pin("K", "Cathode")],
      schematicPosition: POS,
      pcbPosition: POS,
    },
  },
  {
    label: "Capacitor (SMD 0805)",
    comp: {
      ref: "C1",
      type: "capacitor",
      value: "100nF",
      package: "0805",
      description: "100nF decoupling cap",
      pins: [pin("1", "1"), pin("2", "2")],
      schematicPosition: POS,
      pcbPosition: POS,
    },
  },
  {
    label: "Electrolytic Cap (small)",
    comp: {
      ref: "C2",
      type: "capacitor",
      value: "10uF",
      package: "Radial-5mm",
      description: "10uF electrolytic",
      pins: [pin("+", "+"), pin("-", "-")],
      schematicPosition: POS,
      pcbPosition: POS,
    },
  },
  {
    label: "Electrolytic Cap (large)",
    comp: {
      ref: "C3",
      type: "capacitor",
      value: "470uF",
      package: "Radial-10mm",
      description: "470uF electrolytic",
      pins: [pin("+", "+"), pin("-", "-")],
      schematicPosition: POS,
      pcbPosition: POS,
    },
  },
  {
    label: "Diode",
    comp: {
      ref: "D3",
      type: "diode",
      value: "1N4148",
      package: "DO-35",
      description: "Signal diode",
      pins: [pin("A", "Anode"), pin("K", "Cathode")],
      schematicPosition: POS,
      pcbPosition: POS,
    },
  },
  {
    label: "USB-C Connector",
    comp: {
      ref: "J1",
      type: "connector",
      value: "USB-C Power",
      package: "USB-C",
      description: "USB Type-C connector",
      pins: [
        { id: "VBUS", name: "VBUS", type: "power" },
        { id: "GND", name: "GND", type: "ground" },
        { id: "CC1", name: "CC1", type: "signal" },
        { id: "CC2", name: "CC2", type: "signal" },
      ],
      schematicPosition: POS,
      pcbPosition: POS,
    },
  },
  {
    label: "JST Connector (3-pin)",
    comp: {
      ref: "J2",
      type: "connector",
      value: "JST PH 3-pin",
      package: "JST-PH-3",
      description: "JST PH 3-pin header",
      pins: [pin("1", "1"), pin("2", "2"), pin("3", "3")],
      schematicPosition: POS,
      pcbPosition: POS,
    },
  },
  {
    label: "Generic Connector (4-pin)",
    comp: {
      ref: "J3",
      type: "connector",
      value: "Pin Header 4-pin",
      package: "PinHeader-1x4",
      description: "4-pin header",
      pins: [pin("1", "1"), pin("2", "2"), pin("3", "3"), pin("4", "4")],
      schematicPosition: POS,
      pcbPosition: POS,
    },
  },

  // ── Value-based (named component dispatch) ──────────────────
  {
    label: "WS2812B NeoPixel",
    comp: {
      ref: "LED1",
      type: "led",
      value: "WS2812B",
      package: "5050",
      description: "Addressable RGB LED",
      pins: [
        { id: "VDD", name: "VDD", type: "power" },
        { id: "DOUT", name: "DOUT", type: "signal" },
        { id: "GND", name: "GND", type: "ground" },
        { id: "DIN", name: "DIN", type: "signal" },
      ],
      schematicPosition: POS,
      pcbPosition: POS,
    },
  },
  {
    label: "Piezo Buzzer",
    comp: {
      ref: "BZ1",
      type: "ic",
      value: "Piezo Buzzer",
      package: "Buzzer-12mm",
      description: "12mm piezo buzzer",
      pins: [pin("+", "+"), pin("-", "-")],
      schematicPosition: POS,
      pcbPosition: POS,
    },
  },
  {
    label: "Arduino Nano",
    comp: {
      ref: "U1",
      type: "ic",
      value: "Arduino Nano",
      package: "DIP-30",
      description: "Arduino Nano microcontroller",
      pins: [
        { id: "D0", name: "D0", type: "signal" },
        { id: "D1", name: "D1", type: "signal" },
        { id: "5V", name: "5V", type: "power" },
        { id: "GND", name: "GND", type: "ground" },
      ],
      schematicPosition: POS,
      pcbPosition: POS,
    },
  },
  {
    label: "Raspberry Pi Pico",
    comp: {
      ref: "U2",
      type: "ic",
      value: "Raspberry Pi Pico",
      package: "Module",
      description: "RP2040 dev board",
      pins: [
        { id: "GP0", name: "GP0", type: "signal" },
        { id: "GP1", name: "GP1", type: "signal" },
        { id: "3V3", name: "3V3", type: "power" },
        { id: "GND", name: "GND", type: "ground" },
      ],
      schematicPosition: POS,
      pcbPosition: POS,
    },
  },
  {
    label: "OLED SSD1306",
    comp: {
      ref: "U3",
      type: "ic",
      value: "SSD1306 OLED 128x64",
      package: "Module",
      description: "0.96\" I2C OLED display",
      pins: [
        { id: "VCC", name: "VCC", type: "power" },
        { id: "GND", name: "GND", type: "ground" },
        { id: "SCL", name: "SCL", type: "signal" },
        { id: "SDA", name: "SDA", type: "signal" },
      ],
      schematicPosition: POS,
      pcbPosition: POS,
    },
  },
  {
    label: "LCD 1602",
    comp: {
      ref: "U4",
      type: "ic",
      value: "LCD 1602 I2C",
      package: "Module",
      description: "16x2 character LCD with I2C",
      pins: [
        { id: "VCC", name: "VCC", type: "power" },
        { id: "GND", name: "GND", type: "ground" },
        { id: "SDA", name: "SDA", type: "signal" },
        { id: "SCL", name: "SCL", type: "signal" },
      ],
      schematicPosition: POS,
      pcbPosition: POS,
    },
  },
  {
    label: "DHT22 Sensor",
    comp: {
      ref: "U5",
      type: "ic",
      value: "DHT22",
      package: "SIP-3",
      description: "Temperature & humidity sensor",
      pins: [
        { id: "VCC", name: "VCC", type: "power" },
        { id: "DATA", name: "DATA", type: "signal" },
        { id: "GND", name: "GND", type: "ground" },
      ],
      schematicPosition: POS,
      pcbPosition: POS,
    },
  },

  // ── Package-based (genericIC dispatch) ──────────────────────
  {
    label: "DIP-8 IC",
    comp: {
      ref: "U6",
      type: "ic",
      value: "NE555",
      package: "DIP-8",
      description: "555 Timer IC",
      pins: [
        pin("1", "GND"),
        pin("2", "TRIG"),
        pin("3", "OUT"),
        pin("4", "RESET"),
        pin("5", "CTRL"),
        pin("6", "THR"),
        pin("7", "DIS"),
        pin("8", "VCC"),
      ],
      schematicPosition: POS,
      pcbPosition: POS,
    },
  },
  {
    label: "SOIC-8 IC",
    comp: {
      ref: "U7",
      type: "ic",
      value: "LM358",
      package: "SOIC-8",
      description: "Dual op-amp",
      pins: [
        pin("1", "OUT1"),
        pin("2", "IN1-"),
        pin("3", "IN1+"),
        pin("4", "GND"),
        pin("5", "IN2+"),
        pin("6", "IN2-"),
        pin("7", "OUT2"),
        pin("8", "VCC"),
      ],
      schematicPosition: POS,
      pcbPosition: POS,
    },
  },
  {
    label: "Generic Module",
    comp: {
      ref: "U8",
      type: "ic",
      value: "ESP-01",
      package: "Module",
      description: "ESP8266 WiFi module",
      pins: [
        { id: "VCC", name: "VCC", type: "power" },
        { id: "GND", name: "GND", type: "ground" },
        { id: "TX", name: "TX", type: "signal" },
        { id: "RX", name: "RX", type: "signal" },
      ],
      schematicPosition: POS,
      pcbPosition: POS,
    },
  },
  {
    label: "Generic IC (fallback)",
    comp: {
      ref: "U9",
      type: "ic",
      value: "Custom IC",
      package: "QFP-32",
      description: "Generic IC package",
      pins: [pin("1", "1"), pin("2", "2"), pin("3", "3"), pin("4", "4")],
      schematicPosition: POS,
      pcbPosition: POS,
    },
  },
];
