import { useState, useEffect, useCallback } from "react";
import { GALLERY_ITEMS, type GalleryItem } from "./galleryData";
import GalleryCell from "./GalleryCell";
import ModelFixChat from "./ModelFixChat";

export default function ComponentGallery() {
  const [focused, setFocused] = useState<GalleryItem | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [previewError, setPreviewError] = useState(false);

  // Listen for Vite HMR updates to auto-refresh the 3D preview
  useEffect(() => {
    if (!import.meta.hot) return;
    const handler = () => setRefreshKey((k) => k + 1);
    import.meta.hot.on("vite:afterUpdate", handler);
    return () => {
      import.meta.hot!.off("vite:afterUpdate", handler);
    };
  }, []);

  const handleApplied = useCallback(() => {
    setPreviewError(false);
    // Give Vite HMR a moment to pick up the file change
    setTimeout(() => setRefreshKey((k) => k + 1), 600);
  }, []);

  // Detail view — large single-component preview + model editor chat
  if (focused) {
    return (
      <div className="bg-gray-100 p-6 h-full flex flex-col">
        <div className="flex items-center gap-4 mb-4">
          <button
            onClick={() => {
              setFocused(null);
              setPreviewError(false);
            }}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            &larr; Back to Grid
          </button>
          <h2 className="text-lg font-bold text-gray-800">
            {focused.label}
          </h2>
          <span className="text-sm text-gray-400">{focused.comp.package}</span>
        </div>

        <div className="flex-1 flex gap-4 min-h-0">
          {/* Large 3D preview */}
          <div className="flex-1 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            {previewError ? (
              <div className="w-full h-full flex items-center justify-center bg-red-50">
                <div className="text-center">
                  <p className="text-sm text-red-600 font-medium mb-2">
                    Model crashed
                  </p>
                  <p className="text-xs text-red-400">
                    Use Revert in the editor to undo
                  </p>
                </div>
              </div>
            ) : (
              <GalleryCellWithErrorBoundary
                key={`${focused.comp.ref}-${refreshKey}`}
                comp={focused.comp}
                label={focused.label}
                onError={() => setPreviewError(true)}
              />
            )}
          </div>

          {/* Right panel: component info + model editor */}
          <div className="w-80 shrink-0 flex flex-col gap-3 min-h-0">
            {/* Component info (compact) */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 overflow-auto shrink-0 max-h-48">
              <h3 className="font-semibold text-xs text-gray-600 mb-2">Component Info</h3>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                <dt className="text-gray-400">Ref</dt>
                <dd className="text-gray-700 font-mono">{focused.comp.ref}</dd>
                <dt className="text-gray-400">Type</dt>
                <dd className="text-gray-700">{focused.comp.type}</dd>
                <dt className="text-gray-400">Value</dt>
                <dd className="text-gray-700">{focused.comp.value}</dd>
                <dt className="text-gray-400">Package</dt>
                <dd className="text-gray-700 font-mono">{focused.comp.package}</dd>
                <dt className="text-gray-400">Pins</dt>
                <dd className="text-gray-700">
                  {focused.comp.pins.map((p) => p.name).join(", ")}
                </dd>
              </dl>
            </div>

            {/* Model editor chat */}
            <div className="flex-1 min-h-0">
              <ModelFixChat comp={focused.comp} onApplied={handleApplied} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Grid view
  return (
    <div className="bg-gray-100 p-6">
      <header className="mb-6">
        <p className="text-sm text-gray-500">
          Click a component to inspect it. Orbit with click-drag, zoom with scroll.
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {GALLERY_ITEMS.map((item) => (
          <div
            key={item.comp.ref}
            className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden cursor-pointer hover:border-blue-300 hover:shadow-md transition-all"
            onClick={() => setFocused(item)}
          >
            <div className="px-3 py-2 border-b border-gray-100">
              <span className="font-semibold text-sm text-gray-700">
                {item.label}
              </span>
              <span className="ml-2 text-xs text-gray-400">
                {item.comp.package}
              </span>
            </div>
            <div className="h-48">
              <GalleryCell comp={item.comp} label={item.label} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Simple error boundary wrapper ────────────────────────────────

import { Component as ReactComponent, type ReactNode, type ErrorInfo } from "react";
import type { Component } from "../../types/circuit";

interface EBProps {
  comp: Component;
  label: string;
  onError: () => void;
}

interface EBState {
  hasError: boolean;
}

class GalleryCellErrorBoundary extends ReactComponent<
  EBProps & { children: ReactNode },
  EBState
> {
  state: EBState = { hasError: false };

  static getDerivedStateFromError(): EBState {
    return { hasError: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    this.props.onError();
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

function GalleryCellWithErrorBoundary({
  comp,
  label,
  onError,
}: EBProps) {
  return (
    <GalleryCellErrorBoundary comp={comp} label={label} onError={onError}>
      <GalleryCell comp={comp} label={label} interactive />
    </GalleryCellErrorBoundary>
  );
}
