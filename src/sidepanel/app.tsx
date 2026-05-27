import { marked } from "marked";
import type { FunctionalComponent } from "preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import type {
	AgentStatus,
	AgentTraceEntry,
	ChatMessage,
	PanelToWorker,
	WorkerToPanel,
} from "../types/messages";
import { ExtensionLuaClient, isLuaRelayRequest } from "./extension-lua-client";

const App: FunctionalComponent = () => {
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [trace, setTrace] = useState<AgentTraceEntry[]>([]);
	const [status, setStatus] = useState<AgentStatus>("idle");
	const [statusReason, setStatusReason] = useState<string | undefined>();
	const [taskInput, setTaskInput] = useState("");
	const [apiKey, setApiKey] = useState("");
	const [baseUrl, setBaseUrl] = useState("https://api.anthropic.com");
	const [model, setModel] = useState("claude-sonnet-4-20250514");
	const [showSettings, setShowSettings] = useState(false);
	const workerRef = useRef<Worker | null>(null);
	const chatScrollRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		const client = ExtensionLuaClient.getInstance();

		// Initialize extension-lua session
		client.init().catch((err: unknown) => {
			console.warn("Extension-lua init failed:", err);
		});

		// Wire relay callback: when client has a response for the worker,
		// forward it via postMessage
		ExtensionLuaClient.relayCallback = (msg) => {
			workerRef.current?.postMessage(msg);
		};

		const w = new Worker(chrome.runtime.getURL("worker.js"), {
			type: "module",
		});

		w.onmessage = (e: MessageEvent<WorkerToPanel>) => {
			const msg = e.data;
			switch (msg.type) {
				case "workerReady":
					setStatus("idle");
					break;
				case "agentStatus":
					setStatus(msg.status);
					setStatusReason(msg.reason);
					break;
				case "agentMessage":
					setMessages((prev) => [...prev, msg.message]);
					break;
				case "agentTextDelta": {
					setMessages((prev) => {
						const idx = prev.findIndex((m) => m.id === msg.messageId);
						if (idx >= 0) {
							const next = [...prev];
							const existing = next[idx];
							if (existing) {
								next[idx] = { ...existing, text: existing.text + msg.text };
							}
							return next;
						}
						return [
							...prev,
							{
								kind: "assistant",
								id: msg.messageId,
								text: msg.text,
								timestamp: Date.now(),
							},
						];
					});
					break;
				}
				case "agentTrace":
					setTrace((prev) => {
						const idx = prev.findIndex((e) => e.id === msg.entry.id);
						if (idx >= 0) {
							const updated = [...prev];
							updated[idx] = { ...prev[idx], ...msg.entry };
							return updated;
						}
						return [...prev, msg.entry];
					});
					break;
				case "agentError":
					setMessages((prev) => [
						...prev,
						{
							kind: "system",
							id: crypto.randomUUID(),
							text: `Error: ${msg.error.message}`,
							timestamp: Date.now(),
						},
					]);
					break;
				case "luaRunRequest":
					if (isLuaRelayRequest(msg)) {
						client.handleRelayRequest(msg);
					}
					break;
			}
		};

		workerRef.current = w;

		return () => {
			ExtensionLuaClient.relayCallback = null;
			w.terminate();
			client.dispose().catch(() => {});
		};
	}, []);

	useEffect(() => {
		chrome.storage.local.get(
			["anthropicApiKey", "anthropicBaseUrl", "anthropicModel"],
			(result: {
				anthropicApiKey?: string;
				anthropicBaseUrl?: string;
				anthropicModel?: string;
			}) => {
				if (result.anthropicApiKey) {
					setApiKey(result.anthropicApiKey);
				}
				if (result.anthropicBaseUrl) {
					setBaseUrl(result.anthropicBaseUrl);
				}
				if (result.anthropicModel) {
					setModel(result.anthropicModel);
				}
			},
		);
	}, []);

	// Auto-scroll chat to bottom whenever messages or trace update
	useEffect(() => {
		const el = chatScrollRef.current;
		if (!el) return;
		el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
	}, [messages, trace]);

	const postToWorker = useCallback((msg: PanelToWorker) => {
		workerRef.current?.postMessage(msg);
	}, []);

	const handleRun = useCallback(() => {
		const task = taskInput.trim();
		if (!task) return;
		if (!apiKey) {
			setShowSettings(true);
			return;
		}

		setTaskInput("");

		postToWorker({
			type: "settingsUpdated",
			settings: { anthropicApiKey: apiKey, baseUrl, model },
		});
		postToWorker({ type: "agentStart", task });
	}, [taskInput, apiKey, baseUrl, model, postToWorker]);

	const handleStop = useCallback(() => {
		postToWorker({ type: "agentStop" });
	}, [postToWorker]);

	const handleSaveApiKey = useCallback(() => {
		chrome.storage.local.set({
			anthropicApiKey: apiKey,
			anthropicBaseUrl: baseUrl,
			anthropicModel: model,
		});
		postToWorker({
			type: "settingsUpdated",
			settings: { anthropicApiKey: apiKey, baseUrl, model },
		});
		setShowSettings(false);
	}, [apiKey, baseUrl, model, postToWorker]);

	const handleExportConversation = useCallback(() => {
		const payload = {
			exportedAt: new Date().toISOString(),
			messages,
			trace,
		};
		const blob = new Blob([JSON.stringify(payload, null, 2)], {
			type: "application/json",
		});
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `browsergent-conversation-${Date.now()}.json`;
		a.click();
		URL.revokeObjectURL(url);
	}, [messages, trace]);

	const isRunning =
		status === "running" ||
		status === "waiting_for_model" ||
		status === "executing_tool";
	const stepCount = trace.length;

	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				height: "100vh",
				fontFamily: "system-ui, sans-serif",
				fontSize: "13px",
			}}
		>
			{/* Header */}
			<div
				style={{
					padding: "8px 12px",
					borderBottom: "1px solid #e0e0e0",
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
				}}
			>
				<div style={{ display: "flex", alignItems: "center" }}>
					<span style={{ fontWeight: "bold", fontSize: "14px" }}>Browsergent</span>
				</div>
				<button
					type="button"
					onClick={() => setShowSettings(!showSettings)}
					style={{
						padding: "4px 8px",
						border: "1px solid #ccc",
						background: "none",
						cursor: "pointer",
						borderRadius: "4px",
					}}
				>
					Settings
				</button>
			</div>

			{/* Settings */}
			{showSettings && (
				<div
					style={{
						padding: "8px 12px",
						borderBottom: "1px solid #e0e0e0",
						background: "#f8f8f8",
					}}
				>
					<div style={{ display: "grid", gap: "8px" }}>
						<label>
							<span style={{ display: "block", marginBottom: "4px" }}>
								Anthropic API Key:
							</span>
							<input
								type="password"
								value={apiKey}
								onInput={(e) => setApiKey((e.target as HTMLInputElement).value)}
								style={{
									width: "100%",
									padding: "4px 8px",
									border: "1px solid #ccc",
									borderRadius: "4px",
								}}
							/>
						</label>
						<label>
							<span style={{ display: "block", marginBottom: "4px" }}>
								Base URL:
							</span>
							<input
								type="text"
								value={baseUrl}
								onInput={(e) =>
									setBaseUrl((e.target as HTMLInputElement).value)
								}
								style={{
									width: "100%",
									padding: "4px 8px",
									border: "1px solid #ccc",
									borderRadius: "4px",
								}}
							/>
						</label>
						<label>
							<span style={{ display: "block", marginBottom: "4px" }}>
								Model:
							</span>
							<input
								type="text"
								value={model}
								onInput={(e) => setModel((e.target as HTMLInputElement).value)}
								style={{
									width: "100%",
									padding: "4px 8px",
									border: "1px solid #ccc",
									borderRadius: "4px",
								}}
							/>
						</label>
						<button
							type="button"
							onClick={handleSaveApiKey}
							style={{
								padding: "4px 12px",
								background: "#4a90d9",
								color: "white",
								border: "none",
								borderRadius: "4px",
								cursor: "pointer",
							}}
						>
							Save
						</button>
						<button
							type="button"
							onClick={handleExportConversation}
							style={{
								padding: "4px 12px",
								background: "#666",
								color: "white",
								border: "none",
								borderRadius: "4px",
								cursor: "pointer",
							}}
						>
							Export conversation
						</button>
					</div>
				</div>
			)}

			{/* Main content */}
			<div
				ref={chatScrollRef}
				style={{ flex: 1, overflow: "auto", padding: "8px 12px" }}
			>
				<ChatPanel messages={messages} trace={trace} />
			</div>

			{/* Status bar */}
			<div
				style={{
					padding: "4px 12px",
					borderTop: "1px solid #e0e0e0",
					fontSize: "11px",
					color: "#666",
				}}
			>
				Status: {status}
				{statusReason ? ` — ${statusReason}` : ""} | Tool calls: {stepCount}
			</div>

			{/* Input */}
			<div
				style={{
					padding: "8px 12px",
					borderTop: "1px solid #e0e0e0",
					display: "flex",
					gap: "8px",
				}}
			>
				<input
					type="text"
					value={taskInput}
					onInput={(e) => setTaskInput((e.target as HTMLInputElement).value)}
					onKeyDown={(e) => {
						if (e.key === "Enter" && !isRunning) handleRun();
					}}
					placeholder="Type a task..."
					disabled={isRunning}
					style={{
						flex: 1,
						padding: "6px 8px",
						border: "1px solid #ccc",
						borderRadius: "4px",
					}}
				/>
				{isRunning ? (
					<button
						type="button"
						onClick={handleStop}
						style={{
							padding: "6px 16px",
							background: "#d94a4a",
							color: "white",
							border: "none",
							borderRadius: "4px",
							cursor: "pointer",
						}}
					>
						Stop
					</button>
				) : (
					<button
						type="button"
						onClick={handleRun}
						style={{
							padding: "6px 16px",
							background: "#4a90d9",
							color: "white",
							border: "none",
							borderRadius: "4px",
							cursor: "pointer",
						}}
					>
						Run
					</button>
				)}
			</div>
		</div>
	);
};

function renderMarkdown(text: string): string {
	const safe = text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");

	const html = marked.parse(safe, { async: false }) as string;

	return html
		.replace(
			/<pre>/g,
			'<pre style="background:#f0f0f0;padding:8px;border-radius:4px;overflow:auto;font-size:12px;line-height:1.4;margin:4px 0;">',
		)
		.replace(
			/<code>/g,
			'<code style="background:#f0f0f0;padding:1px 4px;border-radius:3px;font-size:12px;">',
		)
		.replace(/<ul>/g, '<ul style="margin:4px 0;padding-left:16px;">')
		.replace(/<ol>/g, '<ol style="margin:4px 0;padding-left:16px;">')
		.replace(/<a /g, '<a style="color:#4a90d9;text-decoration:underline;" ')
		.replace(/<p>/g, '<p style="margin:0 0 4px 0;">');
}

function ChatPanel({
	messages,
	trace,
}: {
	messages: ChatMessage[];
	trace: AgentTraceEntry[];
}) {
	const timeline = [
		...messages.map((m) => ({
			type: "message" as const,
			data: m,
			ts: m.timestamp,
			id: m.id,
		})),
		...trace.map((t) => ({
			type: "trace" as const,
			data: t,
			ts: t.timestamp,
			id: t.id,
		})),
	];
	timeline.sort((a, b) => a.ts - b.ts);

	return (
		<div>
			{timeline.map((item) =>
				item.type === "message" ? (
					<MessageBubble key={item.id} message={item.data} />
				) : (
					<TraceEntryCompact key={item.id} entry={item.data} />
				),
			)}
		</div>
	);
}

function MessageBubble({ message }: { message: ChatMessage }) {
	return (
		<div
			data-testid={`chat-message-${message.kind}`}
			style={{
				marginBottom: "8px",
				padding: "8px 10px",
				borderRadius: "4px",
				background:
					message.kind === "user"
						? "#e3f2fd"
						: message.kind === "system"
							? "#fff3e0"
							: "#f5f5f5",
				lineHeight: "1.5",
			}}
		>
			<div
				style={{
					fontSize: "11px",
					color: "#666",
					marginBottom: "4px",
					textTransform: "capitalize",
				}}
			>
				{message.kind}
			</div>
			<div dangerouslySetInnerHTML={{ __html: renderMarkdown(message.text) }} />
		</div>
	);
}

function TraceEntryCompact({ entry }: { entry: AgentTraceEntry }) {
	const [expanded, setExpanded] = useState(false);
	const icon =
		entry.status === "done" ? "✓" : entry.status === "error" ? "✗" : "…";
	const color =
		entry.status === "done"
			? "#22c55e"
			: entry.status === "error"
				? "#ef4444"
				: "#f59e0b";

	return (
		<div
			style={{
				fontSize: "12px",
				borderRadius: "4px",
				border: "1px solid #e0e0e0",
				background: "#fafafa",
				overflow: "hidden",
			}}
		>
			<div
				onClick={() => setExpanded(!expanded)}
				style={{
					padding: "6px 10px",
					display: "flex",
					alignItems: "center",
					gap: "6px",
					cursor: "pointer",
					fontFamily: "monospace",
				}}
			>
				<span style={{ color }}>{icon}</span>
				<span style={{ color: "#666" }}>#{entry.step}</span>
				<span style={{ fontWeight: "bold" }}>{entry.toolName}</span>
				{!expanded && entry.toolInput && (
					<span
						style={{
							color: "#999",
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap",
							flex: 1,
						}}
					>
						{entry.toolInput.slice(0, 60)}
					</span>
				)}
			</div>
			{expanded && (
				<div
					style={{
						padding: "8px 10px",
						borderTop: "1px solid #e0e0e0",
						fontFamily: "monospace",
						fontSize: "11px",
					}}
				>
					{entry.toolInput && (
						<div style={{ marginBottom: "6px" }}>
							<div style={{ color: "#666", marginBottom: "2px" }}>
								Input:
							</div>
							<div
								style={{
									whiteSpace: "pre-wrap",
									color: "#333",
									background: "#f0f0f0",
									padding: "4px 6px",
									borderRadius: "3px",
								}}
							>
								{entry.toolInput}
							</div>
						</div>
					)}
					{entry.result && (
						<div>
							<div style={{ color: "#666", marginBottom: "2px" }}>
								Result:
							</div>
							<div
								style={{
									whiteSpace: "pre-wrap",
									color: "#333",
									background: "#f0f0f0",
									padding: "4px 6px",
									borderRadius: "3px",
								}}
							>
								{entry.result}
							</div>
						</div>
					)}
				</div>
			)}
		</div>
	);
}

export default App;
