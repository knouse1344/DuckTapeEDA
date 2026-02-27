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

/* ---------- Helpers to extract Score & Verdict from AI text ---------- */

function parseScore(text: string): number | null {
  const match = text.match(/\*\*Score:\s*(\d+)\/10\*\*/);
  return match ? parseInt(match[1], 10) : null;
}

function parseVerdict(text: string): string | null {
  const match = text.match(/\*\*Verdict:\*\*\s*(.+)/);
  return match ? match[1].trim() : null;
}

/** Remove the trailing --- / Score / Verdict block so we don't render it twice. */
function stripScoreBlock(text: string): string {
  return text
    .replace(/\n*-{3,}\s*\n*\*\*Score:\s*\d+\/10\*\*[\s\S]*$/, "")
    .trim();
}

/* ---------- Score Ring SVG ---------- */

function ScoreRing({ score }: { score: number }) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 10) * circumference;
  const color = score >= 8 ? "#16a34a" : score >= 5 ? "#d97706" : "#dc2626";
  const bgFill = score >= 8 ? "#dcfce7" : score >= 5 ? "#fef3c7" : "#fee2e2";

  return (
    <div className="flex-shrink-0">
      <svg width="88" height="88" viewBox="0 0 88 88">
        {/* Filled background circle */}
        <circle cx="44" cy="44" r={radius} fill={bgFill} stroke="#e5e7eb" strokeWidth="5" />
        {/* Progress arc */}
        <circle
          cx="44"
          cy="44"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          strokeLinecap="round"
          transform="rotate(-90 44 44)"
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
        {/* Score number */}
        <text
          x="44"
          y="39"
          textAnchor="middle"
          dominantBaseline="middle"
          fill={color}
          fontSize="26"
          fontWeight="700"
        >
          {score}
        </text>
        {/* /10 label */}
        <text
          x="44"
          y="58"
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#9ca3af"
          fontSize="11"
        >
          / 10
        </text>
      </svg>
    </div>
  );
}

/* ---------- Main Component ---------- */

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

  const passCount = findings.filter((f) => f.severity === "pass").length;
  const warnCount = findings.filter((f) => f.severity === "warning").length;
  const errCount = findings.filter((f) => f.severity === "error").length;

  // Extract score/verdict from AI text so we can render them visually
  const score = parseScore(aiAnalysis);
  const verdict = parseVerdict(aiAnalysis);
  const displayAi = score !== null ? stripScoreBlock(aiAnalysis) : aiAnalysis;

  // Score card color theming
  const scoreCardClass =
    score !== null
      ? score >= 8
        ? "bg-green-50/60 border-green-200"
        : score >= 5
          ? "bg-amber-50/60 border-amber-200"
          : "bg-red-50/60 border-red-200"
      : "";
  const verdictTextClass =
    score !== null
      ? score >= 8
        ? "text-green-800"
        : score >= 5
          ? "text-amber-800"
          : "text-red-800"
      : "";

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

        <div className="flex items-center gap-2">
          {/* Summary pills */}
          {findings.length > 0 && (
            <div className="flex items-center gap-1.5">
              {passCount > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                  {passCount} passed
                </span>
              )}
              {warnCount > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                  {warnCount} warning{warnCount !== 1 ? "s" : ""}
                </span>
              )}
              {errCount > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
                  {errCount} error{errCount !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          )}
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-lg leading-none ml-2"
          >
            &times;
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-auto px-5 py-4 space-y-5">
        {/* Score + Verdict card — skeleton while checking, filled once AI finishes */}
        {score !== null ? (
          <div className={`flex items-center gap-5 p-4 rounded-xl border ${scoreCardClass}`}>
            <ScoreRing score={score} />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                Verdict
              </p>
              <p className={`text-sm font-medium leading-snug ${verdictTextClass}`}>
                {verdict || "Review complete."}
              </p>
            </div>
          </div>
        ) : checking ? (
          <div className="flex items-center gap-5 p-4 rounded-xl border border-gray-200 bg-gray-50/60">
            {/* Pulsing placeholder ring */}
            <div className="flex-shrink-0 animate-pulse">
              <svg width="88" height="88" viewBox="0 0 88 88">
                <circle cx="44" cy="44" r="36" fill="#f3f4f6" stroke="#e5e7eb" strokeWidth="5" />
                <text x="44" y="46" textAnchor="middle" dominantBaseline="middle" fill="#9ca3af" fontSize="13">
                  ...
                </text>
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                Verdict
              </p>
              <p className="text-sm text-gray-400 italic">
                Reviewing your design...
              </p>
            </div>
          </div>
        ) : null}

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
            <span className="animate-pulse">{"\u23F3"}</span>
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
            {displayAi ? (
              <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap text-sm leading-relaxed">
                {displayAi}
              </div>
            ) : checking ? (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <span className="animate-pulse">{"\u2728"}</span>
                Analyzing design...
              </div>
            ) : null}
            {checking && aiAnalysis && (
              <span className="inline-block w-1.5 h-4 bg-gray-400 animate-pulse ml-0.5 align-text-bottom" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
