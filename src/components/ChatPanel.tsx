import { useState, useRef, useEffect } from "react";
import type { ChatMessage } from "../types/circuit";
import { useAuth } from "../contexts/AuthContext";
import ApiKeySettings from "./ApiKeySettings";

function BouncingDots() {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-blue-500"
          style={{
            animation: "dotBounce 1.4s infinite ease-in-out both",
            animationDelay: `${i * 0.16}s`,
          }}
        />
      ))}
      <style>{`
        @keyframes dotBounce {
          0%, 80%, 100% { transform: scale(0.4); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </span>
  );
}

function ElapsedTimer() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="text-[10px] text-blue-400/70 tabular-nums ml-auto pl-3">
      {seconds}s
    </span>
  );
}

interface Props {
  messages: ChatMessage[];
  onSend: (message: string) => void;
  loading: boolean;
  refining?: boolean;
  buildingDesign?: boolean;
}

export default function ChatPanel({
  messages,
  onSend,
  loading,
  refining,
  buildingDesign,
}: Props) {
  const { user } = useAuth();
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const canChat = !!user?.hasApiKey;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, refining]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || loading || !canChat) return;
    onSend(trimmed);
    setInput("");
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* API Key settings */}
      <div className="p-3 border-b border-gray-200">
        <ApiKeySettings />
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 mt-20">
            <p className="text-lg font-medium">DuckTape EDA</p>
            <p className="text-sm mt-1">
              {canChat
                ? "Describe a circuit board and I'll design it for you."
                : "Add your Anthropic API key above to start."}
            </p>
          </div>
        )}

        {messages.map((msg, i) => {
          const isStreaming = loading && i === messages.length - 1 && msg.role === "assistant";

          return (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "bg-blue-600 text-white rounded-br-md"
                    : "bg-gray-100 text-gray-800 rounded-bl-md"
                }`}
              >
                {msg.content}
                {isStreaming && (
                  <span className="inline-block w-1.5 h-4 bg-gray-400 ml-0.5 align-middle animate-pulse" />
                )}
                {msg.design && !isStreaming && (
                  <span className="inline-block ml-2 text-xs opacity-70">
                    (design updated)
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {loading && (
          <div className="flex justify-start">
            <div
              className="rounded-2xl rounded-bl-md px-4 py-2.5 text-xs text-blue-700 flex items-center gap-2.5 border"
              style={{
                background: "linear-gradient(135deg, #eff6ff 0%, #f0f9ff 50%, #eff6ff 100%)",
                backgroundSize: "200% 200%",
                animation: "shimmer 2s ease-in-out infinite",
                borderColor: "#bfdbfe",
              }}
            >
              <BouncingDots />
              <span className="font-medium">
                {refining
                  ? "Refining & validating..."
                  : buildingDesign
                    ? "Building circuit design..."
                    : "Thinking..."}
              </span>
              <ElapsedTimer />
            </div>
            <style>{`
              @keyframes shimmer {
                0%, 100% { background-position: 0% 50%; }
                50% { background-position: 100% 50%; }
              }
            `}</style>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-3 border-t border-gray-200">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              canChat
                ? "Describe your circuit board..."
                : "Add your API key above first"
            }
            disabled={!canChat || loading}
            className="flex-1 px-4 py-2.5 text-sm border border-gray-300 rounded-full focus:outline-none focus:border-blue-400 disabled:opacity-50 disabled:bg-gray-50"
          />
          <button
            type="submit"
            disabled={!canChat || !input.trim() || loading}
            className="px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-full hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
