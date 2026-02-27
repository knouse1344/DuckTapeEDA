import { useState } from "react";

interface Props {
  apiKey: string;
  onApiKeyChange: (key: string) => void;
}

export default function ApiKeyInput({ apiKey, onApiKeyChange }: Props) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="flex items-center gap-2 p-3 border-b border-gray-200 bg-gray-50">
      <label className="text-xs font-medium text-gray-500 whitespace-nowrap">
        API Key
      </label>
      <input
        type={visible ? "text" : "password"}
        value={apiKey}
        onChange={(e) => onApiKeyChange(e.target.value)}
        placeholder="sk-ant-..."
        className="flex-1 text-sm px-2 py-1 border border-gray-300 rounded focus:outline-none focus:border-blue-400 bg-white"
      />
      <button
        onClick={() => setVisible(!visible)}
        className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1"
      >
        {visible ? "Hide" : "Show"}
      </button>
    </div>
  );
}
