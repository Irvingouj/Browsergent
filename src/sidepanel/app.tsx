import type { FunctionalComponent } from "preact";
import { useCallback, useEffect, useMemo, useRef } from "preact/hooks";
import { useStore } from "zustand/react";
import { exportConversation } from "../controllers/export-controller";
import {
	selectActiveSessionId,
	selectAgentStatus,
	selectAgentStatusReason,
	selectApiKey,
	selectBaseUrl,
	selectMessageIds,
	selectMessagesById,
	selectModel,
	selectSessionPanelOpen,
	selectSessions,
	selectSettingsOpen,
	selectTaskDraft,
	selectTraceEntries,
} from "../state/selectors";
import { browsergentStore } from "../state/store";
import type { ChatMessage } from "../types/messages";
import { ChatPanel } from "./components/ChatPanel";
import { InputBar } from "./components/InputBar";
import { SettingsForm } from "./components/SettingsForm";
import { useAppInit } from "./components/use-app-init";
import { useTitleGeneration } from "./components/use-title-generation";
import { SessionPanel } from "./session-panel";

const App: FunctionalComponent = () => {
	const messageIds = useStore(browsergentStore, selectMessageIds);
	const messagesById = useStore(browsergentStore, selectMessagesById);
	const messages = useMemo(
		() =>
			messageIds
				.map((id) => messagesById[id])
				.filter((m): m is ChatMessage => !!m),
		[messageIds, messagesById],
	);
	const trace = useStore(browsergentStore, selectTraceEntries);
	const status = useStore(browsergentStore, selectAgentStatus);
	const statusReason = useStore(browsergentStore, selectAgentStatusReason);
	const taskInput = useStore(browsergentStore, selectTaskDraft);
	const apiKey = useStore(browsergentStore, selectApiKey);
	const baseUrl = useStore(browsergentStore, selectBaseUrl);
	const model = useStore(browsergentStore, selectModel);
	const showSettings = useStore(browsergentStore, selectSettingsOpen);
	const sessionPanelOpen = useStore(browsergentStore, selectSessionPanelOpen);
	const _sessions = useStore(browsergentStore, selectSessions);
	const _activeSessionId = useStore(browsergentStore, selectActiveSessionId);

	const {
		initialized,
		bridgeRef,
		extjsControllerRef: _extjsControllerRef,
		settingsControllerRef,
		sessionControllerRef,
	} = useAppInit();
	const chatScrollRef = useRef<HTMLDivElement | null>(null);
	useTitleGeneration(sessionControllerRef, messages);

	useEffect(() => {
		sessionControllerRef.current?.scheduleSave(messages, trace);
	}, [messages, trace, sessionControllerRef]);

	useEffect(() => {
		const el = chatScrollRef.current;
		if (!el) return;
		el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
	}, [messages, trace]);

	const handleRun = useCallback(() => {
		const task = taskInput.trim();
		if (!task) return;
		if (!apiKey) {
			browsergentStore.getState().setSettingsOpen(true);
			return;
		}
		const sessionId = sessionControllerRef.current?.getActiveSessionId();
		if (!sessionId) return;

		browsergentStore.getState().setTaskDraft("");

		const runId = crypto.randomUUID();
		browsergentStore.getState().agentRunRequested(runId);

		bridgeRef.current?.post({
			type: "agentStart",
			runId,
			sessionId,
			task,
			settings: { anthropicApiKey: apiKey, baseUrl, model },
		});
	}, [taskInput, apiKey, baseUrl, model, sessionControllerRef, bridgeRef]);

	const handleStop = useCallback(() => {
		const runId = browsergentStore.getState().agent.activeRunId;
		bridgeRef.current?.post({ type: "agentStop", runId });
	}, [bridgeRef]);

	const handleSaveApiKey = useCallback(() => {
		settingsControllerRef.current
			?.save({ anthropicApiKey: apiKey, baseUrl, model })
			.then(() => {
				browsergentStore.getState().setSettingsOpen(false);
			})
			.catch((err: unknown) => {
				console.warn("Settings save failed:", err);
			});
	}, [apiKey, baseUrl, model, settingsControllerRef]);

	const handleExportConversation = useCallback(() => {
		exportConversation({
			exportedAt: new Date().toISOString(),
			messages,
			trace,
		});
	}, [messages, trace]);

	const reloadSessionList = useCallback(async () => {
		const list = await sessionControllerRef.current?.listSessions();
		if (list) {
			browsergentStore.getState().sessionListLoaded(list);
		}
	}, [sessionControllerRef]);

	const handleSwitchSession = useCallback(
		async (id: string) => {
			sessionControllerRef.current?.cancelPendingSave();
			const data = await sessionControllerRef.current?.switchSession(id);
			if (data) {
				browsergentStore.getState().hydrateChat(data.messages);
				browsergentStore.getState().hydrateTrace(data.trace);
			}
			browsergentStore.getState().activeSessionChanged(id);
			browsergentStore.getState().agentReset();
			browsergentStore.getState().sessionPanelOpenChanged(false);
			browsergentStore.getState().setSettingsOpen(false);
			await reloadSessionList();
		},
		[reloadSessionList, sessionControllerRef],
	);

	const handleCreateSession = useCallback(async () => {
		sessionControllerRef.current?.cancelPendingSave();
		const newId = await sessionControllerRef.current?.createSession();
		if (!newId) return;
		browsergentStore.getState().clearChat();
		browsergentStore.getState().clearTrace();
		browsergentStore.getState().agentReset();
		browsergentStore.getState().sessionCreated(newId);
		browsergentStore.getState().sessionPanelOpenChanged(false);
		await reloadSessionList();
	}, [reloadSessionList, sessionControllerRef]);

	const handleDeleteSession = useCallback(
		async (id: string) => {
			sessionControllerRef.current?.cancelPendingSave();
			const wasActive =
				sessionControllerRef.current?.getActiveSessionId() === id;
			await sessionControllerRef.current?.deleteSession(id);
			browsergentStore.getState().sessionDeleted(id);
			const activeId = sessionControllerRef.current?.getActiveSessionId();
			if (activeId && wasActive) {
				const data = await sessionControllerRef.current?.load();
				if (data) {
					browsergentStore.getState().hydrateChat(data.messages);
					browsergentStore.getState().hydrateTrace(data.trace);
				}
				browsergentStore.getState().activeSessionChanged(activeId);
			}
			await reloadSessionList();
		},
		[reloadSessionList, sessionControllerRef],
	);

	const handleUpdateTitle = useCallback(
		async (id: string, title: string) => {
			await sessionControllerRef.current?.updateTitle(id, title, true);
			browsergentStore.getState().sessionTitleUpdated(id, title);
		},
		[sessionControllerRef],
	);

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
					position: "relative",
					zIndex: 102,
					background: "#fff",
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
						browsergentStore
							.getState()
							.sessionPanelOpenChanged(!sessionPanelOpen)
					}
					style={{
						padding: "4px 8px",
						border: "none",
						background: "none",
						cursor: "pointer",
						borderRadius: "4px",
						display: "flex",
						alignItems: "center",
					}}
					title="More options"
				>
					<svg
						width="16"
						height="16"
						viewBox="0 0 16 16"
						fill="none"
						xmlns="http://www.w3.org/2000/svg"
					>
						<title>More options</title>
						<circle cx="8" cy="4" r="1.5" fill="currentColor" />
						<circle cx="8" cy="8" r="1.5" fill="currentColor" />
						<circle cx="8" cy="12" r="1.5" fill="currentColor" />
					</svg>
				</button>
			</div>

			{/* Settings */}
			{showSettings && (
				<SettingsForm
					onSave={handleSaveApiKey}
					onExport={handleExportConversation}
				/>
			)}

			{/* Main content */}
			<div
				ref={chatScrollRef}
				style={{
					flex: 1,
					overflow: "auto",
					padding: "8px 12px",
					position: "relative",
				}}
			>
				{messages.length > 0 && !isRunning && (
					<button
						type="button"
						onClick={handleCreateSession}
						style={{
							position: "absolute",
							top: "8px",
							left: "12px",
							padding: "4px 8px",
							fontSize: "11px",
							border: "1px solid #ccc",
							borderRadius: "4px",
							background: "white",
							cursor: "pointer",
							zIndex: 1,
						}}
					>
						New
					</button>
				)}
				<ChatPanel />
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
			<InputBar isRunning={isRunning} onRun={handleRun} onStop={handleStop} />

			{sessionPanelOpen && sessionControllerRef.current && (
				<SessionPanel
					sessionController={sessionControllerRef.current}
					onSwitchSession={handleSwitchSession}
					onCreateSession={handleCreateSession}
					onDeleteSession={handleDeleteSession}
					onUpdateTitle={handleUpdateTitle}
					onSettingsClick={() =>
						browsergentStore.getState().setSettingsOpen(true)
					}
					canSwitch={!isRunning}
				/>
			)}
		</div>
	);
};

export default App;
