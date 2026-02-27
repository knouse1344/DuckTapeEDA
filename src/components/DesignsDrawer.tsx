import { useState, useEffect } from "react";
import type { DesignSummary } from "../services/designs";
import { listDesigns, deleteDesign as deleteDesignApi } from "../services/designs";

interface Props {
  open: boolean;
  onClose: () => void;
  onLoad: (id: number) => void;
  onNew: () => void;
  token: string;
  activeDesignId: number | null;
  refreshKey: number;
}

export default function DesignsDrawer({
  open,
  onClose,
  onLoad,
  onNew,
  token,
  activeDesignId,
  refreshKey,
}: Props) {
  const [designs, setDesigns] = useState<DesignSummary[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    listDesigns(token)
      .then(setDesigns)
      .catch(() => setDesigns([]))
      .finally(() => setLoading(false));
  }, [open, token, refreshKey]);

  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (!confirm("Delete this design?")) return;
    try {
      await deleteDesignApi(token, id);
      setDesigns((prev) => prev.filter((d) => d.id !== id));
      if (id === activeDesignId) onNew();
    } catch {
      // ignore
    }
  };

  const formatDate = (ts: number) => {
    const d = new Date(ts * 1000);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/20 z-40"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div
        className={`fixed top-0 left-0 h-full w-80 bg-white shadow-xl z-50 transform transition-transform duration-200 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-800">My Designs</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-lg leading-none"
          >
            &times;
          </button>
        </div>

        <div className="p-3">
          <button
            onClick={() => { onNew(); onClose(); }}
            className="w-full px-3 py-2 text-sm font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50"
          >
            + New Design
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-4">
          {loading && (
            <p className="text-xs text-gray-400 text-center mt-8">Loading...</p>
          )}

          {!loading && designs.length === 0 && (
            <p className="text-xs text-gray-400 text-center mt-8">
              No saved designs yet.
            </p>
          )}

          {designs.map((d) => (
            <button
              key={d.id}
              onClick={() => { onLoad(d.id); onClose(); }}
              className={`w-full text-left px-3 py-2.5 rounded-lg mb-1 group transition-colors ${
                d.id === activeDesignId
                  ? "bg-blue-50 border border-blue-200"
                  : "hover:bg-gray-50 border border-transparent"
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-800 truncate">
                    {d.name}
                  </p>
                  {d.description && (
                    <p className="text-xs text-gray-400 truncate mt-0.5">
                      {d.description}
                    </p>
                  )}
                  <p className="text-xs text-gray-300 mt-1">
                    {formatDate(d.updated_at)}
                  </p>
                </div>
                <span
                  onClick={(e) => handleDelete(e, d.id)}
                  className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 ml-2 text-xs cursor-pointer"
                >
                  Delete
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
