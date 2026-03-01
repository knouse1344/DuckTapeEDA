import { useState, useRef, lazy, Suspense } from "react";
import type { ChatMessage, CircuitDesign } from "./types/circuit";
import { sendMessageStreaming } from "./services/claude";
import {
  saveDesign,
  updateDesign,
  getDesign,
} from "./services/designs";
import { checkDesign, type CheckFinding } from "./services/designCheck";
import { useAuth } from "./contexts/AuthContext";
import ChatPanel from "./components/ChatPanel";
import DesignViewer from "./components/DesignViewer";
import DesignsDrawer from "./components/DesignsDrawer";
import LoginPage from "./components/LoginPage";

// Lazy-load component gallery (available in all environments)
const ComponentGallery = lazy(() => import("./components/threed/ComponentGallery"));

export default function App() {
  const { user, token, loading: authLoading, logout } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentDesign, setCurrentDesign] = useState<CircuitDesign | null>(
    null
  );
  const [streaming, setStreaming] = useState(false);
  const [refining, setRefining] = useState(false);
  const [buildingDesign, setBuildingDesign] = useState(false);
  const streamingTextRef = useRef("");

  // Design saving state
  const [currentDesignId, setCurrentDesignId] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerRefreshKey, setDrawerRefreshKey] = useState(0);

  // Design check state
  const [checking, setChecking] = useState(false);
  const [checkFindings, setCheckFindings] = useState<CheckFinding[]>([]);
  const [checkAiText, setCheckAiText] = useState("");
  const checkAiRef = useRef("");

  // Component gallery toggle
  const [showGallery, setShowGallery] = useState(false);

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
          // Detect incomplete JSON block = design is being generated
          const hasOpenJson = /```json/.test(currentText) && !/```json\s*[\s\S]*?```/.test(currentText);
          setBuildingDesign(hasOpenJson);
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
      const finalMessages = [...updatedMessages, assistantMessage];
      setMessages(finalMessages);

      if (response.design) {
        setCurrentDesign(response.design);
        clearCheckResults();

        // Auto-save: create or update
        try {
          if (currentDesignId) {
            await updateDesign(token, currentDesignId, response.design, finalMessages);
          } else {
            const id = await saveDesign(token, response.design, finalMessages);
            setCurrentDesignId(id);
          }
          setDrawerRefreshKey((k) => k + 1);
        } catch {
          // Save failed silently — don't break the chat flow
          console.error("Auto-save failed");
        }
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
      setBuildingDesign(false);
    }
  };

  const clearCheckResults = () => {
    setCheckFindings([]);
    setCheckAiText("");
    checkAiRef.current = "";
  };

  const handleCheckDesign = async () => {
    if (!token || !currentDesign) return;

    setChecking(true);
    clearCheckResults();

    try {
      await checkDesign(
        token,
        currentDesign,
        (findings) => setCheckFindings(findings),
        (delta) => {
          checkAiRef.current += delta;
          setCheckAiText(checkAiRef.current);
        },
      );
    } catch (err) {
      setCheckFindings((prev) => [
        ...prev,
        {
          severity: "error" as const,
          category: "general",
          title: "Check failed",
          detail: err instanceof Error ? err.message : "Design check failed",
        },
      ]);
    } finally {
      setChecking(false);
    }
  };

  const handleLoadDesign = async (id: number) => {
    if (!token) return;
    try {
      const saved = await getDesign(token, id);
      setMessages(saved.messages);
      setCurrentDesign(saved.design);
      setCurrentDesignId(saved.id);
    } catch {
      console.error("Failed to load design");
    }
  };

  const handleNewDesign = () => {
    setMessages([]);
    setCurrentDesign(null);
    setCurrentDesignId(null);
  };

  const handleUpdatePosition = (ref: string, x: number, y: number, rotation: number) => {
    setCurrentDesign(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        components: prev.components.map(c =>
          c.ref === ref ? { ...c, pcbPosition: { x, y, rotation } } : c
        ),
      };
    });
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
          <button
            onClick={() => setShowGallery(true)}
            className="text-sm text-gray-500 hover:text-gray-700 font-medium"
          >
            Components
          </button>
          <button
            onClick={() => setDrawerOpen(true)}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            My Designs
          </button>
          <span className="text-sm text-gray-600">{user.name}</span>
          <button
            onClick={logout}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Designs drawer */}
      <DesignsDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onLoad={handleLoadDesign}
        onNew={handleNewDesign}
        token={token!}
        activeDesignId={currentDesignId}
        refreshKey={drawerRefreshKey}
      />

      {/* Main panels */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        <div className="w-full md:w-[40%] border-r border-gray-200 overflow-hidden">
          <ChatPanel
            messages={messages}
            onSend={handleSend}
            loading={streaming}
            refining={refining}
            buildingDesign={buildingDesign}
          />
        </div>
        <div className="w-full md:w-[60%] overflow-hidden">
          <DesignViewer
            design={currentDesign}
            onCheckDesign={handleCheckDesign}
            checking={checking}
            checkFindings={checkFindings}
            checkAiText={checkAiText}
            onCloseCheck={clearCheckResults}
            onUpdatePosition={handleUpdatePosition}
          />
        </div>
      </div>

      {/* Component gallery overlay */}
      {showGallery && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col">
          <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-200">
            <button
              onClick={() => setShowGallery(false)}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              &larr; Back to Design
            </button>
            <span className="text-sm font-semibold text-gray-700">Component Gallery</span>
          </div>
          <div className="flex-1 overflow-auto">
            <Suspense
              fallback={
                <div className="h-full flex items-center justify-center">
                  <div className="text-gray-400 text-sm">Loading gallery...</div>
                </div>
              }
            >
              <ComponentGallery />
            </Suspense>
          </div>
        </div>
      )}
    </div>
  );
}

function stripJsonBlock(text: string): string {
  // Strip complete JSON fenced blocks
  let result = text.replace(/```json\s*[\s\S]*?```/g, "").trim();
  // Strip incomplete JSON blocks still being streamed (no closing ```)
  if (result.includes("```json")) {
    result = result.replace(/```json[\s\S]*$/, "").trim();
  }
  return result;
}
