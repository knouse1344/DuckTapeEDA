import { useState, useRef, useCallback, useEffect } from "react";
import type { CircuitDesign, Component } from "../types/circuit";
import {
  getFootprint,
  getComponentBounds,
  rectanglesOverlap,
} from "../lib/footprintLookup";

interface Props {
  design: CircuitDesign;
  onUpdatePosition: (
    ref: string,
    x: number,
    y: number,
    rotation: number
  ) => void;
}

const BOARD_MARGIN = 5; // mm

const TYPE_COLORS: Record<string, string> = {
  ic: "#3b82f6",
  connector: "#ef4444",
  resistor: "#22c55e",
  capacitor: "#a855f7",
  led: "#eab308",
  diode: "#f97316",
  mosfet: "#06b6d4",
  switch: "#ec4899",
  regulator: "#14b8a6",
};

export default function PcbLayoutEditor({ design, onUpdatePosition }: Props) {
  const { board, components } = design;

  // ── State ──────────────────────────────────────────────────
  const [dragging, setDragging] = useState<{
    ref: string;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);

  const svgRef = useRef<SVGSVGElement>(null);
  const panStartRef = useRef<{
    clientX: number;
    clientY: number;
    panX: number;
    panY: number;
  } | null>(null);

  // ── Helpers ────────────────────────────────────────────────

  const screenToBoard = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } => {
      const svg = svgRef.current;
      if (!svg) return { x: 0, y: 0 };
      const rect = svg.getBoundingClientRect();
      const viewW = (board.width + 2 * BOARD_MARGIN) / zoom;
      const viewH = (board.height + 2 * BOARD_MARGIN) / zoom;
      const svgX =
        ((clientX - rect.left) / rect.width) * viewW +
        (pan.x - BOARD_MARGIN / zoom);
      const svgY =
        ((clientY - rect.top) / rect.height) * viewH +
        (pan.y - BOARD_MARGIN / zoom);
      return { x: svgX, y: svgY };
    },
    [board.width, board.height, zoom, pan]
  );

  const getEffectivePosition = useCallback(
    (comp: Component) => {
      if (dragging && dragPos && comp.ref === dragging.ref) {
        return { x: dragPos.x, y: dragPos.y, rotation: comp.pcbPosition.rotation };
      }
      return comp.pcbPosition;
    },
    [dragging, dragPos]
  );

  // ── Overlap detection ──────────────────────────────────────

  const getOverlaps = useCallback(() => {
    const overlapping = new Set<string>();
    for (let i = 0; i < components.length; i++) {
      for (let j = i + 1; j < components.length; j++) {
        const a = components[i];
        const b = components[j];
        const posA = getEffectivePosition(a);
        const posB = getEffectivePosition(b);
        const fpA = getFootprint(a.package, a.type, a.value);
        const fpB = getFootprint(b.package, b.type, b.value);
        const boundsA = getComponentBounds(posA.x, posA.y, posA.rotation, fpA);
        const boundsB = getComponentBounds(posB.x, posB.y, posB.rotation, fpB);
        if (rectanglesOverlap(boundsA, boundsB)) {
          overlapping.add(a.ref);
          overlapping.add(b.ref);
        }
      }
    }
    return overlapping;
  }, [components, getEffectivePosition]);

  const isOutOfBounds = useCallback(
    (comp: Component) => {
      const pos = getEffectivePosition(comp);
      const fp = getFootprint(comp.package, comp.type, comp.value);
      const bounds = getComponentBounds(pos.x, pos.y, pos.rotation, fp);
      return (
        bounds.left < 0 ||
        bounds.top < 0 ||
        bounds.right > board.width ||
        bounds.bottom > board.height
      );
    },
    [board, getEffectivePosition]
  );

  // ── Mouse handlers ─────────────────────────────────────────

  const handleComponentMouseDown = useCallback(
    (e: React.MouseEvent, comp: Component) => {
      if (e.button !== 0) return; // left-click only
      if (e.shiftKey) return; // shift+left is pan
      e.stopPropagation();
      const boardPt = screenToBoard(e.clientX, e.clientY);
      const pos = comp.pcbPosition;
      setDragging({
        ref: comp.ref,
        offsetX: boardPt.x - pos.x,
        offsetY: boardPt.y - pos.y,
      });
      setDragPos({ x: pos.x, y: pos.y });
    },
    [screenToBoard]
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, comp: Component) => {
      e.preventDefault();
      e.stopPropagation();
      const pos = comp.pcbPosition;
      const newRotation = (pos.rotation + 90) % 360;
      onUpdatePosition(comp.ref, pos.x, pos.y, newRotation);
    },
    [onUpdatePosition]
  );

  const handleSvgMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Middle-click or shift+left-click on background => pan
      if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
        e.preventDefault();
        setIsPanning(true);
        panStartRef.current = {
          clientX: e.clientX,
          clientY: e.clientY,
          panX: pan.x,
          panY: pan.y,
        };
      }
    },
    [pan]
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      setZoom((prev) => {
        const factor = e.deltaY < 0 ? 1.1 : 0.9;
        return Math.min(5, Math.max(0.2, prev * factor));
      });
    },
    []
  );

  // ── Window-level listeners for drag & pan ──────────────────

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (dragging) {
        const boardPt = screenToBoard(e.clientX, e.clientY);
        const x = Math.round((boardPt.x - dragging.offsetX) * 10) / 10;
        const y = Math.round((boardPt.y - dragging.offsetY) * 10) / 10;
        setDragPos({ x, y });
      }

      if (isPanning && panStartRef.current) {
        const svg = svgRef.current;
        if (!svg) return;
        const rect = svg.getBoundingClientRect();
        const viewW = (board.width + 2 * BOARD_MARGIN) / zoom;
        const viewH = (board.height + 2 * BOARD_MARGIN) / zoom;
        const dx =
          ((e.clientX - panStartRef.current.clientX) / rect.width) * viewW;
        const dy =
          ((e.clientY - panStartRef.current.clientY) / rect.height) * viewH;
        setPan({
          x: panStartRef.current.panX - dx,
          y: panStartRef.current.panY - dy,
        });
      }
    };

    const handleMouseUp = (_e: MouseEvent) => {
      if (dragging && dragPos) {
        const comp = components.find((c) => c.ref === dragging.ref);
        if (comp) {
          onUpdatePosition(
            comp.ref,
            dragPos.x,
            dragPos.y,
            comp.pcbPosition.rotation
          );
        }
        setDragging(null);
        setDragPos(null);
      }

      if (isPanning) {
        setIsPanning(false);
        panStartRef.current = null;
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [
    dragging,
    dragPos,
    isPanning,
    zoom,
    board.width,
    board.height,
    components,
    onUpdatePosition,
    screenToBoard,
  ]);

  // ── Render calculations ────────────────────────────────────

  const viewW = (board.width + 2 * BOARD_MARGIN) / zoom;
  const viewH = (board.height + 2 * BOARD_MARGIN) / zoom;
  const viewBox = `${pan.x - BOARD_MARGIN / zoom} ${pan.y - BOARD_MARGIN / zoom} ${viewW} ${viewH}`;

  const overlapping = getOverlaps();

  const cursor = dragging ? "grabbing" : isPanning ? "grabbing" : "grab";

  return (
    <div
      className="w-full h-full bg-gray-100 overflow-hidden"
      onContextMenu={(e) => e.preventDefault()}
    >
      <svg
        ref={svgRef}
        className="w-full h-full"
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
        style={{ cursor }}
        onMouseDown={handleSvgMouseDown}
        onWheel={handleWheel}
      >
        {/* Board outline */}
        <rect
          x={0}
          y={0}
          width={board.width}
          height={board.height}
          rx={board.cornerRadius}
          ry={board.cornerRadius}
          fill="#1a5c2a"
          stroke="#0f3d1a"
          strokeWidth={0.5}
        />

        {/* Components */}
        {components.map((comp) => {
          const pos = getEffectivePosition(comp);
          const fp = getFootprint(comp.package, comp.type, comp.value);
          const totalW = fp.width + 2 * fp.keepout;
          const totalH = fp.height + 2 * fp.keepout;
          const rot = ((pos.rotation % 360) + 360) % 360;
          const swapped = rot === 90 || rot === 270;
          const w = swapped ? totalH : totalW;
          const h = swapped ? totalW : totalH;

          const color = TYPE_COLORS[comp.type] || "#6b7280";
          const isOverlap = overlapping.has(comp.ref);
          const oob = isOutOfBounds(comp);

          let stroke = color;
          let strokeWidth = 0.4;
          let strokeDasharray: string | undefined;

          if (isOverlap) {
            stroke = "#ef4444";
            strokeWidth = 0.8;
            strokeDasharray = "2 1";
          } else if (oob) {
            stroke = "#f97316";
            strokeWidth = 0.8;
            strokeDasharray = "2 1";
          }

          const fontSize = Math.min(3, w * 0.2);
          const valueFontSize = Math.min(2.5, w * 0.15);
          const displayValue =
            comp.value.length > 15
              ? comp.value.slice(0, 15) + "\u2026"
              : comp.value;

          return (
            <g
              key={comp.ref}
              onMouseDown={(e) => handleComponentMouseDown(e, comp)}
              onContextMenu={(e) => handleContextMenu(e, comp)}
              style={{ cursor: dragging?.ref === comp.ref ? "grabbing" : "grab" }}
            >
              <rect
                x={pos.x - w / 2}
                y={pos.y - h / 2}
                width={w}
                height={h}
                fill={color}
                fillOpacity={0.3}
                stroke={stroke}
                strokeWidth={strokeWidth}
                strokeDasharray={strokeDasharray}
              />
              <text
                x={pos.x}
                y={pos.y - valueFontSize * 0.3}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={fontSize}
                fontWeight="bold"
                fill="white"
                style={{ pointerEvents: "none", userSelect: "none" }}
              >
                {comp.ref}
              </text>
              <text
                x={pos.x}
                y={pos.y + fontSize * 0.7}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={valueFontSize}
                fill="white"
                style={{ pointerEvents: "none", userSelect: "none" }}
              >
                {displayValue}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
