import { GALLERY_ITEMS } from "./galleryData";
import GalleryCell from "./GalleryCell";

export default function ComponentGallery() {
  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">
          Component Gallery (Dev)
        </h1>
        <p className="text-sm text-gray-500">
          Visual preview of every 3D model builder path. Orbit with click-drag,
          zoom with scroll.
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {GALLERY_ITEMS.map((item) => (
          <div
            key={item.comp.ref}
            className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden"
          >
            <div className="px-3 py-2 border-b border-gray-100">
              <span className="font-semibold text-sm text-gray-700">
                {item.label}
              </span>
              <span className="ml-2 text-xs text-gray-400">
                {item.comp.package}
              </span>
            </div>
            <GalleryCell comp={item.comp} label={item.label} />
          </div>
        ))}
      </div>
    </div>
  );
}
