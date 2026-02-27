import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";

export default function ApiKeySettings() {
  const { user, token, refreshUser } = useAuth();
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!user || !token) return null;

  const handleSave = async () => {
    if (!apiKey.trim()) return;
    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/settings/api-key", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save");
      }

      setApiKey("");
      await refreshUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save API key");
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    setSaving(true);
    try {
      await fetch("/api/settings/api-key", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      await refreshUser();
    } catch {
      setError("Failed to remove API key");
    } finally {
      setSaving(false);
    }
  };

  if (user.hasApiKey) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded text-sm">
        <span className="text-green-700 flex-1">API key saved</span>
        <button
          onClick={handleRemove}
          disabled={saving}
          className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
        >
          Remove
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-ant-..."
          className="flex-1 px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={handleSave}
          disabled={saving || !apiKey.trim()}
          className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "..." : "Save"}
        </button>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <p className="text-xs text-gray-400">
        Your Anthropic API key is encrypted and stored securely on the server.
      </p>
    </div>
  );
}
