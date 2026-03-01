import type { CircuitDesign } from "../types/circuit";
import type { CheckFinding } from "../services/designCheck";
import { useState, useEffect, useRef } from "react";
import ThreeDRenderer from "./threed/ThreeDRenderer";
import DesignCheckPanel from "./DesignCheckPanel";
import PcbLayoutEditor from "./PcbLayoutEditor";
import { generateBomCsv, downloadFile } from "../lib/exportBom";
import { generateCplCsv } from "../lib/exportCpl";
import { generateKicadPcb } from "../lib/exportKicad";

interface Props {
  design: CircuitDesign | null;
  onCheckDesign?: () => void;
  checking?: boolean;
  checkFindings?: CheckFinding[];
  checkAiText?: string;
  onCloseCheck?: () => void;
  onUpdatePosition?: (ref: string, x: number, y: number, rotation: number) => void;
  onReroute?: () => void;
  rerouting?: boolean;
}

type Tab = "schematic" | "pcb" | "3d";

export default function DesignViewer({
  design,
  onCheckDesign,
  checking = false,
  checkFindings = [],
  checkAiText = "",
  onCloseCheck,
  onUpdatePosition,
  onReroute,
  rerouting = false,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("pcb");
  const [showBomMenu, setShowBomMenu] = useState(false);
  const bomMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showBomMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (bomMenuRef.current && !bomMenuRef.current.contains(e.target as Node)) {
        setShowBomMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showBomMenu]);

  const handleExportKicad = () => {
    if (!design) return;
    const pcbContent = generateKicadPcb(design);
    const filename = `${design.name.replace(/[^a-zA-Z0-9_-]/g, "_") || "board"}.kicad_pcb`;
    downloadFile(pcbContent, filename, "application/octet-stream");
  };

  const handleExportBom = () => {
    if (!design) return;
    const csvContent = generateBomCsv(design);
    const filename = `${design.name.replace(/[^a-zA-Z0-9_-]/g, "_") || "board"}_BOM.csv`;
    downloadFile(csvContent, filename, "text/csv");
    setShowBomMenu(false);
  };

  const handleExportCpl = () => {
    if (!design) return;
    const csvContent = generateCplCsv(design);
    const filename = `${design.name.replace(/[^a-zA-Z0-9_-]/g, "_") || "board"}_CPL.csv`;
    downloadFile(csvContent, filename, "text/csv");
    setShowBomMenu(false);
  };

  const showCheckPanel = checking || checkFindings.length > 0 || checkAiText.length > 0;

  const tabs: { id: Tab; label: string }[] = [
    { id: "schematic", label: "Schematic" },
    { id: "pcb", label: "PCB" },
    { id: "3d", label: "3D" },
  ];

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Tabs */}
      <div className="flex border-b border-gray-200 bg-white">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id);
              // Close check panel when switching tabs
              if (showCheckPanel && onCloseCheck) onCloseCheck();
            }}
            className={`px-6 py-3 text-sm font-medium transition-colors ${
              activeTab === tab.id && !showCheckPanel
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}

        {/* Check Design button + Export buttons */}
        {design && (
          <div className="ml-auto flex items-center gap-2 pr-4">
            {design.connections?.length > 0 && (!design.traces || design.traces.length === 0) && (
              <button
                onClick={onReroute}
                disabled={rerouting || !onReroute}
                className={`text-xs px-3 py-1.5 rounded font-medium transition-colors ${
                  rerouting
                    ? "bg-amber-100 text-amber-600 cursor-wait"
                    : "border border-amber-400 text-amber-600 hover:bg-amber-50"
                } disabled:opacity-50`}
              >
                {rerouting ? "Routing..." : "Re-route Traces"}
              </button>
            )}
            <button
              onClick={onCheckDesign}
              disabled={checking || !onCheckDesign}
              className={`text-xs px-3 py-1.5 rounded font-medium transition-colors ${
                checking
                  ? "bg-blue-100 text-blue-500 cursor-wait"
                  : showCheckPanel
                    ? "bg-blue-600 text-white"
                    : "border border-blue-300 text-blue-600 hover:bg-blue-50"
              } disabled:opacity-50`}
            >
              {checking ? "Checking..." : "Check Design"}
            </button>
            <button
              onClick={handleExportKicad}
              className="text-xs px-3 py-1.5 border border-gray-300 rounded text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Download KiCad
            </button>
            <div className="relative" ref={bomMenuRef}>
              <button
                onClick={() => setShowBomMenu(!showBomMenu)}
                className="text-xs px-3 py-1.5 border border-gray-300 rounded text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Export &#9662;
              </button>
              {showBomMenu && (
                <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded shadow-lg z-50 min-w-[140px]">
                  <button
                    onClick={handleExportBom}
                    className="block w-full text-left text-xs px-3 py-2 hover:bg-gray-50 text-gray-700"
                  >
                    BOM CSV
                  </button>
                  <button
                    onClick={handleExportCpl}
                    className="block w-full text-left text-xs px-3 py-2 hover:bg-gray-50 text-gray-700"
                  >
                    Pick &amp; Place CSV
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {showCheckPanel ? (
          <DesignCheckPanel
            findings={checkFindings}
            aiAnalysis={checkAiText}
            checking={checking}
            onClose={onCloseCheck || (() => {})}
          />
        ) : !design ? (
          <div className="flex items-center justify-center h-full text-gray-400">
            <div className="text-center">
              <div className="text-4xl mb-3">&#9889;</div>
              <p className="font-medium">No design yet</p>
              <p className="text-sm mt-1">
                Describe a circuit in the chat to get started.
              </p>
            </div>
          </div>
        ) : activeTab === "3d" ? (
          <ThreeDRenderer design={design} />
        ) : activeTab === "pcb" ? (
          <PcbLayoutEditor
            design={design}
            onUpdatePosition={onUpdatePosition ?? (() => {})}
          />
        ) : (
          <div className="p-6 overflow-auto h-full">
            <div className="max-w-2xl mx-auto">
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-gray-800">
                  {design.name}
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  {design.description}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Board: {design.board.width}mm x {design.board.height}mm |{" "}
                  {design.board.layers}-layer
                </p>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">
                  Schematic View — coming soon
                </p>

                <h3 className="text-sm font-semibold text-gray-700 mb-2">
                  Components ({design.components.length})
                </h3>
                <div className="space-y-1 mb-4">
                  {design.components.map((c) => (
                    <div
                      key={c.ref}
                      className="flex items-baseline gap-2 text-sm"
                    >
                      <span className="font-mono font-medium text-blue-600 w-8">
                        {c.ref}
                      </span>
                      <span className="text-gray-700">{c.value}</span>
                      <span className="text-gray-400 text-xs">
                        ({c.package})
                      </span>
                      <span className="text-gray-400 text-xs ml-auto">
                        {c.description}
                      </span>
                    </div>
                  ))}
                </div>

                <h3 className="text-sm font-semibold text-gray-700 mb-2">
                  Connections ({design.connections.length})
                </h3>
                <div className="space-y-1">
                  {design.connections.map((conn) => (
                    <div key={conn.netName} className="text-sm">
                      <span className="font-mono font-medium text-green-600">
                        {conn.netName}
                      </span>
                      <span className="text-gray-500 ml-2">
                        {conn.pins
                          .map((p) => `${p.ref}.${p.pin}`)
                          .join(" — ")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {design.notes.length > 0 && (
                <div className="text-xs text-gray-500 space-y-1">
                  <p className="font-medium">Notes:</p>
                  {design.notes.map((note, i) => (
                    <p key={i}>• {note}</p>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
