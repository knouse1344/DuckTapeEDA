import type { CheckFinding } from "../services/designCheck";

interface Props {
  findings: CheckFinding[];
  aiAnalysis: string;
  checking: boolean;
  onClose: () => void;
}

const SEVERITY_ICON: Record<string, string> = {
  pass: "\u2705",
  warning: "\u26A0\uFE0F",
  error: "\u274C",
};

const SEVERITY_BG: Record<string, string> = {
  pass: "bg-green-50 border-green-200",
  warning: "bg-amber-50 border-amber-200",
  error: "bg-red-50 border-red-200",
};

const CATEGORY_LABELS: Record<string, string> = {
  connections: "Connections",
  protection: "Protection",
  layout: "Layout",
  manufacturing: "Manufacturing",
  structure: "Structure",
  general: "General",
};

export default function DesignCheckPanel({ findings, aiAnalysis, checking, onClose }: Props) {
  // Group findings by category
  const grouped = new Map<string, CheckFinding[]>();
  for (const f of findings) {
    const cat = f.category || "general";
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(f);
  }

  const hasErrors = findings.some((f) => f.severity === "error");
  const hasWarnings = findings.some((f) => f.severity === "warning");
  const allPass = findings.length > 0 && !hasErrors && !hasWarnings;

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-2">
          <span className="text-lg">
            {checking ? "\u23F3" : hasErrors ? "\u274C" : allPass ? "\u2705" : "\u26A0\uFE0F"}
          </span>
          <h2 className="text-sm font-semibold text-gray-800">Design Check Report</h2>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 text-lg leading-none"
        >
          &times;
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-auto px-5 py-4 space-y-5">
        {/* Rule-based findings */}
        {findings.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Quick Checks
            </h3>
            <div className="space-y-3">
              {[...grouped.entries()].map(([category, items]) => (
                <div key={category}>
                  <p className="text-xs font-medium text-gray-400 mb-1.5">
                    {CATEGORY_LABELS[category] || category}
                  </p>
                  <div className="space-y-1.5">
                    {items.map((f, i) => (
                      <div
                        key={i}
                        className={`flex items-start gap-2 px-3 py-2 rounded-lg border text-sm ${SEVERITY_BG[f.severity]}`}
                      >
                        <span className="flex-shrink-0 mt-0.5">{SEVERITY_ICON[f.severity]}</span>
                        <div>
                          <span className="font-medium text-gray-800">{f.title}</span>
                          {f.ref && (
                            <span className="ml-1 text-xs font-mono text-blue-600">{f.ref}</span>
                          )}
                          <p className="text-gray-600 text-xs mt-0.5">{f.detail}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Waiting for rules */}
        {findings.length === 0 && checking && (
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <span className="animate-pulse">\u23F3</span>
            Running checks...
          </div>
        )}

        {/* Divider */}
        {(aiAnalysis || checking) && findings.length > 0 && (
          <hr className="border-gray-200" />
        )}

        {/* AI Analysis */}
        {(aiAnalysis || checking) && (
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              AI Review
            </h3>
            {aiAnalysis ? (
              <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap text-sm leading-relaxed">
                {aiAnalysis}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <span className="animate-pulse">\u2728</span>
                Analyzing design...
              </div>
            )}
            {checking && aiAnalysis && (
              <span className="inline-block w-1.5 h-4 bg-gray-400 animate-pulse ml-0.5 align-text-bottom" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
