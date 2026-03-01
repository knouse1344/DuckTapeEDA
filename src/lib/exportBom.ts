import type { CircuitDesign } from "../types/circuit";

/**
 * Generate JLCPCB-format BOM CSV from a CircuitDesign.
 * Columns: Comment, Designator, Footprint, LCSC Part #
 */
export function generateBomCsv(design: CircuitDesign): string {
  const lines: string[] = [
    "Comment,Designator,Footprint,LCSC Part #",
  ];

  // Group components by value + package (same part = one BOM row)
  const groups = new Map<string, { value: string; package: string; partNumber: string; refs: string[] }>();

  for (const comp of design.components) {
    const key = `${comp.value}||${comp.package}`;
    const existing = groups.get(key);
    if (existing) {
      existing.refs.push(comp.ref);
    } else {
      groups.set(key, {
        value: comp.value,
        package: comp.package,
        partNumber: comp.partNumber ?? "",
        refs: [comp.ref],
      });
    }
  }

  for (const group of groups.values()) {
    const comment = csvEscape(group.value);
    const designators = csvEscape(group.refs.sort().join(", "));
    const footprint = csvEscape(group.package);
    const partNum = csvEscape(group.partNumber);
    lines.push(`${comment},${designators},${footprint},${partNum}`);
  }

  return lines.join("\n");
}

/** Escape a CSV field: wrap in quotes if it contains commas, quotes, or newlines */
function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Trigger a file download in the browser */
export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
