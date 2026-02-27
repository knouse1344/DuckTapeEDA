import { useState } from "react";
import type { ChatMessage, CircuitDesign } from "./types/circuit";
import { sendMessage } from "./services/claude";
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
  const [loading, setLoading] = useState(false);

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
    setMessages(updatedMessages);
    setLoading(true);

    try {
      const response = await sendMessage(token, updatedMessages);
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
      setLoading(false);
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
            loading={loading}
          />
        </div>
        <div className="w-full md:w-[60%] overflow-hidden">
          <DesignViewer design={currentDesign} />
        </div>
      </div>
    </div>
  );
}
