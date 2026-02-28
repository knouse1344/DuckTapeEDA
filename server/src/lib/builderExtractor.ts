import fs from "node:fs";
import path from "node:path";

const BUILD_SCENE_PATH = path.join(
  process.cwd(),
  "src",
  "components",
  "threed",
  "buildScene.ts"
);

const BACKUP_PATH = BUILD_SCENE_PATH + ".bak";

// ── Builder resolution ──────────────────────────────────────────

interface BuilderMapping {
  functionName: string;
}

/**
 * Mirrors the dispatch logic in buildComponent() (buildScene.ts:169-198).
 * Given a component's value/type/package, returns which builder function handles it.
 */
export function resolveBuilder(
  value: string,
  type: string,
  pkg: string
): BuilderMapping {
  const val = value.toLowerCase();

  // Stage 1: Value-based dispatch (named components)
  if (val.includes("arduino nano")) return { functionName: "buildArduinoNano" };
  if (val.includes("raspberry pi pico")) return { functionName: "buildPiPico" };
  if (val.includes("ssd1306")) return { functionName: "buildOLEDModule" };
  if (val.includes("lcd 1602")) return { functionName: "buildLCDModule" };
  if (val.includes("dht22")) return { functionName: "buildDHT22" };
  if (val.includes("ws2812")) return { functionName: "buildWS2812B" };
  if (val.includes("piezo buzzer") || val.includes("passive buzzer"))
    return { functionName: "buildBuzzer" };

  // Stage 2: Type-based dispatch
  switch (type) {
    case "resistor":
      return { functionName: "buildResistor" };
    case "led":
      return { functionName: "buildLED" };
    case "connector":
      return { functionName: "buildConnector" };
    case "capacitor":
      return { functionName: "buildCapacitor" };
    case "diode":
      return { functionName: "buildDiode" };
  }

  // Stage 3: Package-based IC dispatch (mirrors buildGenericIC)
  const pkgLower = pkg.toLowerCase();
  if (pkgLower.includes("dip")) return { functionName: "buildDIP" };
  if (/soic|sop|ssop/.test(pkgLower)) return { functionName: "buildSOIC" };
  if (/module|sip/.test(pkgLower))
    return { functionName: "buildGenericModule" };

  return { functionName: "buildGenericIC" };
}

// ── Function extraction ─────────────────────────────────────────

export interface ExtractedFunction {
  functionName: string;
  sourceCode: string;
  startLine: number; // 0-indexed
  endLine: number; // 0-indexed, inclusive
}

/**
 * Extract a top-level function from buildScene.ts by name.
 * Finds the `function <name>(` declaration and tracks brace depth to find the end.
 */
export function extractFunction(
  fileContent: string,
  functionName: string
): ExtractedFunction | null {
  const lines = fileContent.split("\n");
  const marker = new RegExp(`^function ${functionName}\\(`);

  let startLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (marker.test(lines[i].trim())) {
      startLine = i;
      break;
    }
  }
  if (startLine === -1) return null;

  // Track brace depth to find the matching close brace
  let braceDepth = 0;
  let endLine = startLine;
  for (let i = startLine; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === "{") braceDepth++;
      if (ch === "}") braceDepth--;
    }
    if (braceDepth === 0 && i > startLine) {
      endLine = i;
      break;
    }
  }

  const sourceCode = lines.slice(startLine, endLine + 1).join("\n");
  return { functionName, sourceCode, startLine, endLine };
}

// ── Function replacement ────────────────────────────────────────

/**
 * Replace a function in the file content at the specified line range.
 */
export function replaceFunction(
  fileContent: string,
  extracted: ExtractedFunction,
  newFunctionCode: string
): string {
  const lines = fileContent.split("\n");
  const before = lines.slice(0, extracted.startLine);
  const after = lines.slice(extracted.endLine + 1);
  return [...before, newFunctionCode, ...after].join("\n");
}

// ── Helper signature extraction ─────────────────────────────────

const HELPER_NAMES = [
  "addPad",
  "addRectPad",
  "addLabel",
  "addPinHeaderRow",
  "addMountingHoles",
  "addSMDPassives",
  "addSMDChip",
  "makeBeveledBox",
  "createRoundedRectShape",
  "getLEDColor",
  "parseCapacitance",
  "nextPowerOfTwo",
];

/**
 * Extract function signatures (JSDoc + declaration line) for helper functions.
 * Claude needs to know what's available but shouldn't modify them.
 */
export function extractHelperSignatures(fileContent: string): string {
  const lines = fileContent.split("\n");
  const signatures: string[] = [];

  for (const name of HELPER_NAMES) {
    const marker = new RegExp(`^function ${name}\\(`);
    for (let i = 0; i < lines.length; i++) {
      if (marker.test(lines[i].trim())) {
        // Collect any JSDoc comment above
        const docLines: string[] = [];
        let j = i - 1;
        // Walk backwards through blank lines
        while (j >= 0 && lines[j].trim() === "") j--;
        // Collect JSDoc block
        if (j >= 0 && lines[j].trim().endsWith("*/")) {
          const endDoc = j;
          while (j >= 0 && !lines[j].trim().startsWith("/**")) j--;
          if (j >= 0) {
            docLines.push(...lines.slice(j, endDoc + 1).map((l) => l.trim()));
          }
        }

        // Collect the function signature (up to and including the opening brace line)
        // For multi-line signatures, keep going until we hit "{"
        const sigLines: string[] = [];
        for (let k = i; k < lines.length; k++) {
          sigLines.push(lines[k].trimEnd());
          if (lines[k].includes("{")) {
            // Replace the body with just "{ ... }"
            const lastIdx = sigLines.length - 1;
            sigLines[lastIdx] = sigLines[lastIdx].replace(/\{.*$/, "{ ... }");
            break;
          }
        }

        const block = [...docLines, ...sigLines].join("\n");
        signatures.push(block);
        break;
      }
    }
  }

  return signatures.join("\n\n");
}

// ── Code validation ─────────────────────────────────────────────

/**
 * Validate builder code before writing to disk.
 * Returns null if valid, error message if invalid.
 */
export function validateBuilderCode(
  code: string,
  expectedName: string
): string | null {
  const trimmed = code.trim();

  if (!trimmed.startsWith(`function ${expectedName}(`)) {
    return `Function must start with "function ${expectedName}("`;
  }

  let braces = 0;
  for (const ch of trimmed) {
    if (ch === "{") braces++;
    if (ch === "}") braces--;
    if (braces < 0) return "Unbalanced braces (too many closing)";
  }
  if (braces !== 0) return `Unbalanced braces (depth: ${braces})`;

  if (!/return\s+\w+/.test(trimmed)) {
    return "Missing return statement";
  }

  return null;
}

// ── Code block extraction from Claude response ──────────────────

/**
 * Extract a TypeScript code block from Claude's response text.
 */
export function extractCodeBlock(text: string): string | null {
  const match = text.match(/```typescript\s*([\s\S]*?)```/);
  if (match) return match[1].trim();

  // Fallback: try plain code block
  const fallback = text.match(/```\s*([\s\S]*?)```/);
  if (fallback) return fallback[1].trim();

  return null;
}

// ── File I/O ────────────────────────────────────────────────────

export function readBuildScene(): string {
  return fs.readFileSync(BUILD_SCENE_PATH, "utf-8");
}

export function writeBuildScene(content: string): void {
  fs.writeFileSync(BUILD_SCENE_PATH, content, "utf-8");
}

export function backupBuildScene(content: string): void {
  fs.writeFileSync(BACKUP_PATH, content, "utf-8");
}

export function restoreFromBackup(): boolean {
  if (!fs.existsSync(BACKUP_PATH)) return false;
  const backup = fs.readFileSync(BACKUP_PATH, "utf-8");
  fs.writeFileSync(BUILD_SCENE_PATH, backup, "utf-8");
  return true;
}
