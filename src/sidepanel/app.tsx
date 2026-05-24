import { useState, useCallback, useRef, useEffect } from "preact/hooks";
import type { FunctionalComponent } from "preact";
import type {
  ChatMessage,
  ActionTraceEntry,
  AgentStatus,
} from "../types/messages";
import type { BrowserCommand, BrowserResult } from "../types/browser";
import { AgentLoop } from "../worker/agent-loop";
import type { AnthropicConfig } from "../worker/anthropic";

type Tab = "chat" | "lua";

function executeBrowserCommand(command: BrowserCommand): Promise<BrowserResult> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: "browserCommand", command },
      (response: { type: "commandResult"; result: BrowserResult }) => {
        if (chrome.runtime.lastError) {
          resolve({
            ok: false,
            error: chrome.runtime.lastError.message ?? "Browser command failed",
            code: "E_UNKNOWN",
          });
          return;
        }
        resolve(response.result);
      },
    );
  });
}

const App: FunctionalComponent = () => {
  const [tab, setTab] = useState<Tab>("chat");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [trace, setTrace] = useState<ActionTraceEntry[]>([]);
  const [status, setStatus] = useState<AgentStatus>("idle");
  const [statusReason, setStatusReason] = useState<string | undefined>();
  const [taskInput, setTaskInput] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [luaCode, setLuaCode] = useState("");
  const [luaOutput, setLuaOutput] = useState("");
  const agentLoopRef = useRef<AgentLoop | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chrome.storage.local.get("anthropicApiKey", (result: { anthropicApiKey?: string }) => {
      if (result.anthropicApiKey) {
        setApiKey(result.anthropicApiKey);
      }
    });
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, trace]);

  const handleRun = useCallback(() => {
    if (!taskInput.trim()) return;
    if (!apiKey) {
      setShowSettings(true);
      return;
    }

    if (agentLoopRef.current) {
      agentLoopRef.current.stop();
    }

    const loop = new AgentLoop();
    agentLoopRef.current = loop;

    setMessages([]);
    setTrace([]);

    const config: AnthropicConfig = {
      apiKey,
      model: "claude-sonnet-4-20250514",
    };

    loop.run(taskInput.trim(), 20, config, {
      onStatus(s, reason) {
        setStatus(s);
        setStatusReason(reason);
      },
      onMessage(kind, text) {
        setMessages((prev) => [
          ...prev,
          { kind, id: crypto.randomUUID(), text, timestamp: Date.now() },
        ]);
      },
      onTrace(entry) {
        setTrace((prev) => {
          const idx = prev.findIndex((e) => e.id === entry.id);
          if (idx >= 0) {
            const updated = [...prev];
            updated[idx] = entry;
            return updated;
          }
          return [...prev, entry];
        });
      },
      onError(code, message) {
        setMessages((prev) => [
          ...prev,
          { kind: "system", id: crypto.randomUUID(), text: `Error: ${message}`, timestamp: Date.now() },
        ]);
      },
      executeCommand(command) {
        return executeBrowserCommand(command);
      },
    });
  }, [taskInput, apiKey]);

  const handleStop = useCallback(() => {
    agentLoopRef.current?.stop();
  }, []);

  const handleSaveApiKey = useCallback(() => {
    chrome.storage.local.set({ anthropicApiKey: apiKey });
    setShowSettings(false);
  }, [apiKey]);

  const handleLuaRun = useCallback(() => {
    setTrace([]);
    setLuaOutput("Lua runtime not yet available.\n");
  }, [luaCode]);

  const isRunning = status === "running" || status === "waiting_for_model" || status === "executing_tool";
  const stepCount = trace.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", fontFamily: "system-ui, sans-serif", fontSize: "13px" }}>
      {/* Header */}
      <div style={{ padding: "8px 12px", borderBottom: "1px solid #e0e0e0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={() => setTab("chat")}
            style={{ fontWeight: tab === "chat" ? "bold" : "normal", padding: "4px 8px", border: "none", background: "none", cursor: "pointer" }}
          >
            Chat
          </button>
          <button
            onClick={() => setTab("lua")}
            style={{ fontWeight: tab === "lua" ? "bold" : "normal", padding: "4px 8px", border: "none", background: "none", cursor: "pointer" }}
          >
            Lua
          </button>
        </div>
        <button
          onClick={() => setShowSettings(!showSettings)}
          style={{ padding: "4px 8px", border: "1px solid #ccc", background: "none", cursor: "pointer", borderRadius: "4px" }}
        >
          Settings
        </button>
      </div>

      {/* Settings */}
      {showSettings && (
        <div style={{ padding: "8px 12px", borderBottom: "1px solid #e0e0e0", background: "#f8f8f8" }}>
          <label style={{ display: "block", marginBottom: "4px" }}>Anthropic API Key:</label>
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              type="password"
              value={apiKey}
              onInput={(e) => setApiKey((e.target as HTMLInputElement).value)}
              style={{ flex: 1, padding: "4px 8px", border: "1px solid #ccc", borderRadius: "4px" }}
            />
            <button onClick={handleSaveApiKey} style={{ padding: "4px 12px", background: "#4a90d9", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}>
              Save
            </button>
          </div>
        </div>
      )}

      {/* Main content */}
      <div style={{ flex: 1, overflow: "auto", padding: "8px 12px" }}>
        {tab === "chat" ? (
          <ChatPanel messages={messages} />
        ) : (
          <LuaPanel
            code={luaCode}
            output={luaOutput}
            onCodeChange={setLuaCode}
            onRun={handleLuaRun}
          />
        )}
      </div>

      {/* Trace */}
      {trace.length > 0 && (
        <div style={{ borderTop: "1px solid #e0e0e0", padding: "8px 12px", maxHeight: "200px", overflow: "auto", background: "#fafafa" }}>
          <div style={{ fontWeight: "bold", marginBottom: "4px" }}>Trace ({stepCount} steps)</div>
          {trace.map((entry) => (
            <TraceEntryView key={entry.id} entry={entry} />
          ))}
        </div>
      )}

      {/* Status bar */}
      <div style={{ padding: "4px 12px", borderTop: "1px solid #e0e0e0", fontSize: "11px", color: "#666" }}>
        Status: {status}{statusReason ? ` — ${statusReason}` : ""} | Steps: {stepCount}/20
      </div>

      {/* Input */}
      {tab === "chat" ? (
        <div style={{ padding: "8px 12px", borderTop: "1px solid #e0e0e0", display: "flex", gap: "8px" }}>
          <input
            type="text"
            value={taskInput}
            onInput={(e) => setTaskInput((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !isRunning) handleRun(); }}
            placeholder="Type a task..."
            disabled={isRunning}
            style={{ flex: 1, padding: "6px 8px", border: "1px solid #ccc", borderRadius: "4px" }}
          />
          {isRunning ? (
            <button onClick={handleStop} style={{ padding: "6px 16px", background: "#d94a4a", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}>
              Stop
            </button>
          ) : (
            <button onClick={handleRun} style={{ padding: "6px 16px", background: "#4a90d9", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}>
              Run
            </button>
          )}
        </div>
      ) : null}
      <div ref={messagesEndRef} />
    </div>
  );
};

function ChatPanel({ messages }: { messages: ChatMessage[] }) {
  return (
    <div>
      {messages.map((msg) => (
        <div key={msg.id} style={{ marginBottom: "8px", padding: "6px 8px", borderRadius: "4px", background: msg.kind === "user" ? "#e3f2fd" : msg.kind === "system" ? "#fff3e0" : "#f5f5f5" }}>
          <div style={{ fontSize: "11px", color: "#666", marginBottom: "2px" }}>{msg.kind}</div>
          <div style={{ whiteSpace: "pre-wrap" }}>{msg.text}</div>
        </div>
      ))}
    </div>
  );
}

function LuaPanel({ code, output, onCodeChange, onRun }: { code: string; output: string; onCodeChange: (code: string) => void; onRun: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ marginBottom: "4px", fontWeight: "bold" }}>Lua Playbook</div>
      <textarea
        value={code}
        onInput={(e) => onCodeChange((e.target as HTMLTextAreaElement).value)}
        placeholder={`-- Example playbook\nlocal snap = page.snapshot()\npage.fill("e2", "test@example.com")\npage.click("e4")`}
        style={{ flex: 1, minHeight: "200px", padding: "8px", border: "1px solid #ccc", borderRadius: "4px", fontFamily: "monospace", fontSize: "12px", resize: "vertical" }}
      />
      <button onClick={onRun} style={{ marginTop: "8px", padding: "6px 16px", background: "#4a90d9", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}>
        Run Lua
      </button>
      {output && (
        <div style={{ marginTop: "8px", padding: "8px", background: "#f5f5f5", borderRadius: "4px", fontFamily: "monospace", fontSize: "12px", whiteSpace: "pre-wrap" }}>
          {output}
        </div>
      )}
    </div>
  );
}

function TraceEntryView({ entry }: { entry: ActionTraceEntry }) {
  const cmd = entry.command;
  const icon = entry.status === "done" ? "✓" : entry.status === "error" ? "✗" : "…";
  const color = entry.status === "done" ? "green" : entry.status === "error" ? "red" : "orange";

  return (
    <div style={{ fontSize: "11px", padding: "2px 0", fontFamily: "monospace" }}>
      <span style={{ color }}>{icon}</span>{" "}
      <span style={{ color: "#666" }}>#{entry.step}</span>{" "}
      <span style={{ fontWeight: "bold" }}>{cmd.kind}</span>
      {"refId" in cmd && <span style={{ color: "#666" }}> {cmd.refId}</span>}
      {"text" in cmd && <span style={{ color: "#666" }}> "{cmd.text}"</span>}
      {entry.result && !entry.result.ok && (
        <span style={{ color: "red" }}> → {entry.result.error}</span>
      )}
    </div>
  );
}

export default App;
