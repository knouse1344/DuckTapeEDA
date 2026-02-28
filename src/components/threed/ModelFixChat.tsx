import { useState, useRef, useEffect } from "react";
import type { Component } from "../../types/circuit";
import { useAuth } from "../../contexts/AuthContext";
import {
  sendModelFixMessage,
  revertModelFix,
  type ModelFixMessage,
} from "../../services/modelFix";

interface Props {
  comp: Component;
  onApplied: () => void;
}

export default function ModelFixChat({ comp, onApplied }: Props) {
  const { token } = useAuth();
  const [messages, setMessages] = useState<ModelFixMessage[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState("");
  const [canRevert, setCanRevert] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef("");

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText]);

  // Reset chat when component changes
  useEffect(() => {
    setMessages([]);
    setStreamingText("");
    setInput("");
    setCanRevert(false);
    streamRef.current = "";
  }, [comp.ref, comp.value]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading || !token) return;

    setInput("");
    const newMessages: ModelFixMessage[] = [
      ...messages,
      { role: "user", content: text },
    ];
    setMessages(newMessages);
    setLoading(true);
    setStreamingText("");
    streamRef.current = "";

    try {
      const fullText = await sendModelFixMessage(
        token,
        comp.value,
        comp.type,
        comp.package,
        newMessages,
        (delta) => {
          streamRef.current += delta;
          setStreamingText(streamRef.current);
        },
        () => {
          setCanRevert(true);
          onApplied();
        }
      );

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: fullText },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Error: ${err instanceof Error ? err.message : "Unknown error"}`,
        },
      ]);
    } finally {
      setLoading(false);
      setStreamingText("");
      streamRef.current = "";
    }
  };

  const handleRevert = async () => {
    if (!token) return;
    try {
      await revertModelFix(token);
      setCanRevert(false);
      onApplied();
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Reverted to previous version." },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Revert failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        },
      ]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  /** Strip code blocks from display text for cleaner chat */
  const formatAssistantText = (text: string) => {
    return text.replace(/```typescript[\s\S]*?```/g, "[code applied]").trim();
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
        <span className="text-xs font-semibold text-gray-600">
          Model Editor
        </span>
        {canRevert && (
          <button
            onClick={handleRevert}
            className="text-xs text-red-500 hover:text-red-600 font-medium"
          >
            Revert
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-auto px-3 py-2 space-y-2 min-h-0">
        {messages.length === 0 && !loading && (
          <p className="text-xs text-gray-300 italic">
            Describe what to fix...
          </p>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={
              msg.role === "user"
                ? "text-xs bg-blue-50 text-blue-800 rounded px-2 py-1.5"
                : "text-xs text-gray-600 rounded px-2 py-1.5 bg-gray-50"
            }
          >
            <pre className="whitespace-pre-wrap font-sans">
              {msg.role === "assistant"
                ? formatAssistantText(msg.content)
                : msg.content}
            </pre>
          </div>
        ))}

        {loading && streamingText && (
          <div className="text-xs text-gray-600 rounded px-2 py-1.5 bg-gray-50">
            <pre className="whitespace-pre-wrap font-sans">
              {formatAssistantText(streamingText)}
            </pre>
          </div>
        )}

        {loading && !streamingText && (
          <div className="text-xs text-gray-400 italic">Thinking...</div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-100 px-3 py-2">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g. make the screen thinner"
            disabled={loading}
            className="flex-1 text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-300 disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
