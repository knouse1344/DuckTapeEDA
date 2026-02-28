import { useState } from "react";
import { GALLERY_ITEMS, type GalleryItem } from "./galleryData";
import GalleryCell from "./GalleryCell";

export default function ComponentGallery() {
  const [focused, setFocused] = useState<GalleryItem | null>(null);

  // Detail view — large single-component preview
  if (focused) {
    return (
      <div className="bg-gray-100 p-6 h-full flex flex-col">
        <div className="flex items-center gap-4 mb-4">
          <button
            onClick={() => setFocused(null)}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            &larr; Back to Grid
          </button>
          <h2 className="text-lg font-bold text-gray-800">
            {focused.label}
          </h2>
          <span className="text-sm text-gray-400">{focused.comp.package}</span>
        </div>

        <div className="flex-1 flex gap-6 min-h-0">
          {/* Large 3D preview */}
          <div className="flex-1 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <GalleryCell comp={focused.comp} label={focused.label} interactive />
          </div>

          {/* Component info panel */}
          <div className="w-72 shrink-0 bg-white rounded-lg shadow-sm border border-gray-200 p-4 overflow-auto">
            <h3 className="font-semibold text-sm text-gray-700 mb-3">Component Info</h3>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-gray-400 text-xs">Reference</dt>
                <dd className="text-gray-700 font-mono">{focused.comp.ref}</dd>
              </div>
              <div>
                <dt className="text-gray-400 text-xs">Type</dt>
                <dd className="text-gray-700">{focused.comp.type}</dd>
              </div>
              <div>
                <dt className="text-gray-400 text-xs">Value</dt>
                <dd className="text-gray-700">{focused.comp.value}</dd>
              </div>
              <div>
                <dt className="text-gray-400 text-xs">Package</dt>
                <dd className="text-gray-700 font-mono">{focused.comp.package}</dd>
              </div>
              <div>
                <dt className="text-gray-400 text-xs">Description</dt>
                <dd className="text-gray-700">{focused.comp.description}</dd>
              </div>
              <div>
                <dt className="text-gray-400 text-xs mb-1">Pins ({focused.comp.pins.length})</dt>
                <dd className="space-y-0.5">
                  {focused.comp.pins.map((p) => (
                    <div key={p.id} className="flex items-center gap-2 text-gray-600 font-mono text-xs">
                      <span className="w-8 text-right text-gray-400">{p.id}</span>
                      <span>{p.name}</span>
                      <span className="ml-auto text-gray-300">{p.type}</span>
                    </div>
                  ))}
                </dd>
              </div>
            </dl>
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
