import { useState, useRef } from "react";
import type { ChatMessage, CircuitDesign } from "./types/circuit";
import { sendMessageStreaming } from "./services/claude";
import { useAuth } from "./contexts/AuthContext";
import ChatPanel from "./components/ChatPanel";
import DesignViewer from "./components/DesignViewer";
import LoginPage from "./components/LoginPage";

export default function App() {
  const { user, token, loading: authLoading, logout } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentDesign, setCurrentDesign] = useState<CircuitDesign | null>(
    null
  );
  const [streaming, setStreaming] = useState(false);
  const [refining, setRefining] = useState(false);
  const streamingTextRef = useRef("");

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-400 text-sm">Loading...</div>
      </div>
    );
  }

  // Show login page if not authenticated
  if (!user) {
    return <LoginPage />;
  }

  const handleSend = async (text: string) => {
    if (!token) return;

    const userMessage: ChatMessage = { role: "user", content: text };
    const updatedMessages = [...messages, userMessage];

    // Add user message + empty assistant message for streaming into
    const placeholderAssistant: ChatMessage = { role: "assistant", content: "" };
    setMessages([...updatedMessages, placeholderAssistant]);
    setStreaming(true);
    setRefining(false);
    streamingTextRef.current = "";

    try {
      const response = await sendMessageStreaming(
        token,
        updatedMessages,
        // onDelta — append streamed text to the in-progress assistant message
        (delta) => {
          streamingTextRef.current += delta;
          const currentText = streamingTextRef.current;
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: "assistant",
              content: stripJsonBlock(currentText),
            };
            return updated;
          });
        },
        // onRefining — show refining indicator
        () => {
          setRefining(true);
        },
      );

      // Finalize with the complete response (may be replaced by validation)
      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: response.text,
        design: response.design ?? undefined,
      };
      setMessages([...updatedMessages, assistantMessage]);

      if (response.design) {
        setCurrentDesign(response.design);
      }
    } catch (err) {
      const errorMessage: ChatMessage = {
        role: "assistant",
        content: `Error: ${err instanceof Error ? err.message : "Something went wrong."}`,
      };
      setMessages([...updatedMessages, errorMessage]);
    } finally {
      setStreaming(false);
      setRefining(false);
    }
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="flex items-center gap-3 px-5 py-3 bg-white border-b border-gray-200">
        <span className="text-xl">🩹</span>
        <div>
          <h1 className="text-base font-bold text-gray-800 leading-none">
            DuckTape EDA
          </h1>
          <p className="text-xs text-gray-400">
            Hold your circuits together.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-gray-600">{user.name}</span>
          <button
            onClick={logout}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Main panels */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        <div className="w-full md:w-[40%] border-r border-gray-200 overflow-hidden">
          <ChatPanel
            messages={messages}
            onSend={handleSend}
            loading={streaming}
            refining={refining}
          />
        </div>
        <div className="w-full md:w-[60%] overflow-hidden">
          <DesignViewer design={currentDesign} />
        </div>
      </div>
    </div>
  );
}

function stripJsonBlock(text: string): string {
  return text.replace(/```json\s*[\s\S]*?```/, "").trim();
}
