import { useStore } from "zustand/react";
import { marked } from "marked";
import type { FunctionalComponent } from "preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { exportConversation } from "../controllers/export-controller";
import { LuaController } from "../controllers/lua-controller";
import { SessionController } from "../controllers/session-controller";
import { SettingsController } from "../controllers/settings-controller";
import { WorkerBridge } from "../controllers/worker-bridge";
import { IndexedDBStorage } from "../storage/indexeddb-storage";
import { MemoryStorage } from "../storage/memory-storage";
import { migrateFromChromeStorage } from "../storage/migrate";
import {
	type BrowsergentStore,
	browsergentStore,
} from "../state/store";
import type { AgentTraceEntry, ChatMessage } from "../types/messages";
import type { StorageBackend } from "../storage/storage-backend";

const App: FunctionalComponent = () => {
	const messages = useStore(
		browsergentStore,
		(s: BrowsergentStore) => s.chat.messages,
	);
	const trace = useStore(
		browsergentStore,
		(s: BrowsergentStore) => s.trace.entries,
	);
	const status = useStore(
		browsergentStore,
		(s: BrowsergentStore) => s.agent.status,
	);
	const statusReason = useStore(
		browsergentStore,
		(s: BrowsergentStore) => s.agent.statusReason,
	);
	const taskInput = useStore(
		browsergentStore,
		(s: BrowsergentStore) => s.ui.taskDraft,
	);
	const apiKey = useStore(
		browsergentStore,
		(s: BrowsergentStore) => s.settings.anthropicApiKey,
	);
	const baseUrl = useStore(
		browsergentStore,
		(s: BrowsergentStore) => s.settings.baseUrl,
	);
	const model = useStore(
		browsergentStore,
		(s: BrowsergentStore) => s.settings.model,
	);
	const showSettings = useStore(
		browsergentStore,
		(s: BrowsergentStore) => s.ui.settingsOpen,
	);
	const [initialized, setInitialized] = useState(false);
	const bridgeRef = useRef<WorkerBridge | null>(null);
	const luaControllerRef = useRef<LuaController | null>(null);
	const settingsControllerRef = useRef<SettingsController | null>(null);
	const sessionControllerRef = useRef<SessionController | null>(null);
	const chatScrollRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		let cancelled = false;
		let storageRef: StorageBackend | null = null;

		async function init() {
			try {
				const storage = new IndexedDBStorage();
				await storage.init();
				if (cancelled) { storage.close(); return; }
				await migrateFromChromeStorage(storage);
				if (cancelled) { storage.close(); return; }
				storageRef = storage;
			} catch (err) {
				console.warn("Storage init failed, using memory fallback:", err);
				storageRef = new MemoryStorage();
				if (cancelled) return;
			}

			if (cancelled) return;

			const storage = storageRef;

			const bridge = new WorkerBridge({
				onLuaRunRequest: (msg) => {
					luaControllerRef.current?.handleRelayRequest(msg);
				},
				onAgentHistory: (messages) => {
					sessionControllerRef.current?.saveHistory(messages).catch((err: unknown) => {
						console.warn("History save failed:", err);
					});
				},
			});
			bridgeRef.current = bridge;

			const lua = new LuaController(bridge);
			luaControllerRef.current = lua;

			const settingsCtrl = new SettingsController(storage);
			settingsControllerRef.current = settingsCtrl;

			const sessionCtrl = new SessionController(storage);
			sessionControllerRef.current = sessionCtrl;

			lua.init().catch((err: unknown) => {
				console.warn("Lua init failed:", err);
			});
			bridge.start();
			sessionCtrl
				.load()
				.then((session) => {
					if (session) {
						browsergentStore.getState().hydrateChat(session.messages);
						browsergentStore.getState().hydrateTrace(session.trace);
					}
					sessionCtrl.hydrated = true;
				})
				.catch((err: unknown) => {
					console.warn("Session load failed:", err);
					sessionCtrl.hydrated = true;
				});

			settingsCtrl
				.load()
				.catch((err: unknown) => {
					console.warn("Settings load failed:", err);
				});

			setInitialized(true);
		}

		void init();

		return () => {
			cancelled = true;
			bridgeRef.current?.stop();
			const lua = luaControllerRef.current;
			if (lua) {
				lua.dispose().catch((err: unknown) => {
					console.warn("Lua dispose failed:", err);
				});
			}
			sessionControllerRef.current?.cancelPendingSave();
			void storageRef?.close();
		};
	}, []);

	useEffect(() => {
		sessionControllerRef.current?.scheduleSave(messages, trace);
	}, [messages, trace]);

	// Auto-scroll chat to bottom whenever messages or trace update
	useEffect(() => {
		const el = chatScrollRef.current;
		if (!el) return;
		el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
	}, [messages, trace]);

	const handleRun = useCallback(async () => {
		const task = taskInput.trim();
		if (!task) return;
		if (!apiKey) {
			browsergentStore.getState().setSettingsOpen(true);
			return;
		}

		browsergentStore.getState().setTaskDraft("");

		const runId = crypto.randomUUID();
		browsergentStore.getState().agentRunRequested(runId);

		const priorMessages = await sessionControllerRef.current?.loadHistory();

		bridgeRef.current?.post({
			type: "agentStart",
			runId,
			task,
			settings: { anthropicApiKey: apiKey, baseUrl, model },
			priorMessages: priorMessages ?? undefined,
		});
	}, [taskInput, apiKey, baseUrl, model]);

	const handleStop = useCallback(() => {
		const runId = browsergentStore.getState().agent.activeRunId;
		bridgeRef.current?.post({ type: "agentStop", runId });
	}, []);

	const handleSaveApiKey = useCallback(() => {
		settingsControllerRef.current
			?.save({ anthropicApiKey: apiKey, baseUrl, model })
			.then(() => {
				browsergentStore.getState().setSettingsOpen(false);
			})
			.catch((err: unknown) => {
				console.warn("Settings save failed:", err);
			});
	}, [apiKey, baseUrl, model]);

	const handleExportConversation = useCallback(() => {
		exportConversation({
			exportedAt: new Date().toISOString(),
			messages,
			trace,
		});
	}, [messages, trace]);

	const isRunning =
		status === "loading" ||
		status === "running" ||
		status === "waiting_for_model" ||
		status === "executing_tool";
	const stepCount = trace.length;

	return (
		<div
			data-initialized={initialized}
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
					<span style={{ fontWeight: "bold", fontSize: "14px" }}>
						Browsergent
					</span>
				</div>
				<button
					type="button"
					onClick={() =>
						browsergentStore.getState().setSettingsOpen(!showSettings)
					}
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
								onInput={(e) => {
									const val = (e.target as HTMLInputElement).value;
									browsergentStore.getState().settingsDraftChanged({
										anthropicApiKey: val,
									});
								}}
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
								onInput={(e) => {
									const val = (e.target as HTMLInputElement).value;
									browsergentStore.getState().settingsDraftChanged({
										baseUrl: val,
									});
								}}
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
								onInput={(e) => {
									const val = (e.target as HTMLInputElement).value;
									browsergentStore.getState().settingsDraftChanged({
										model: val,
									});
								}}
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
					onInput={(e) =>
						browsergentStore
							.getState()
							.setTaskDraft((e.target as HTMLInputElement).value)
					}
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
			<button
				type="button"
				onClick={() => setExpanded(!expanded)}
				style={{
					padding: "6px 10px",
					display: "flex",
					alignItems: "center",
					gap: "6px",
					cursor: "pointer",
					fontFamily: "monospace",
					width: "100%",
					border: "none",
					background: "transparent",
					textAlign: "left",
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
			</button>
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
							<div style={{ color: "#666", marginBottom: "2px" }}>Input:</div>
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
							<div style={{ color: "#666", marginBottom: "2px" }}>Result:</div>
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
