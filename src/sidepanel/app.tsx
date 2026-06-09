import type { FunctionalComponent } from "preact";
import { useCallback, useEffect, useMemo, useRef } from "preact/hooks";
import { useStore } from "zustand/react";
import {
	buildExportSnapshot,
	exportConversation,
} from "../controllers/export-controller";
import {
	selectActiveSessionId,
	selectActiveTab,
	selectAgentStatus,
	selectAgentStatusReason,
	selectApiKey,
	selectBaseUrl,
	selectDiagnosticEvents,
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
import { getSkillService } from "../skills/skill-service";
import { parseSkillActivation } from "../skills/resolve-skill-activations";
import type { ChatMessage } from "../types/messages";
import { ChatPanel } from "./components/ChatPanel";
import { InputBar } from "./components/InputBar";
import { JsPlaybookPanel } from "./components/JsPlaybookPanel";
import { SettingsForm } from "./components/SettingsForm";
import { useAppInit } from "./components/use-app-init";
import { useTitleGeneration } from "./components/use-title-generation";

function currentSessionSnapshot(): {
	messages: ChatMessage[];
	trace: ReturnType<typeof selectTraceEntries>;
	diagnostics: ReturnType<typeof selectDiagnosticEvents>;
} {
	const state = browsergentStore.getState();
	const messages = state.chat.messageIds
		.map((id) => state.chat.messagesById[id])
		.filter((message): message is ChatMessage => message !== undefined);
	return {
		messages,
		trace: state.trace.entries,
		diagnostics: state.diagnostics.events,
	};
}

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
	const diagnostics = useStore(browsergentStore, selectDiagnosticEvents);
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
	const activeTab = useStore(browsergentStore, selectActiveTab);

	const {
		initialized,
		workerReady,
		bridgeRef,
		extjsControllerRef: _extjsControllerRef,
		settingsControllerRef,
		sessionControllerRef,
	} = useAppInit();
	const chatScrollRef = useRef<HTMLDivElement | null>(null);
	const inputRef = useRef<HTMLInputElement | null>(null);
	const prevIsRunning = useRef<boolean>(false);
	const shouldFocusRef = useRef<boolean>(false);
	useTitleGeneration(sessionControllerRef, messages);

	useEffect(() => {
		sessionControllerRef.current?.scheduleSave(messages, trace, diagnostics);
	}, [messages, trace, diagnostics, sessionControllerRef]);

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
		const sessionId = sessionControllerRef.current?.getActiveSessionId();
		if (!sessionId) return;

		let resolvedTask = task;
		let skillCatalog = "";
		try {
			const resolved = await getSkillService().resolveRunTask(task);
			resolvedTask = resolved.resolvedTask;
			skillCatalog = resolved.skillCatalog;
		} catch (err: unknown) {
			if (parseSkillActivation(task)) {
				const message = err instanceof Error ? err.message : String(err);
				browsergentStore.getState().appendSystemMessage({
					kind: "system",
					id: crypto.randomUUID(),
					text: `Skill activation failed: ${message}`,
					timestamp: Date.now(),
				});
				return;
			}
			console.warn("Skill catalog failed:", err);
		}

		browsergentStore.getState().setTaskDraft("");

		const runId = crypto.randomUUID();
		browsergentStore.getState().agentRunRequested(runId);

		bridgeRef.current?.post({
			type: "agentStart",
			runId,
			sessionId,
			task,
			resolvedTask,
			skillCatalog,
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
		exportConversation(buildExportSnapshot(messages, trace, diagnostics));
	}, [messages, trace, diagnostics]);

	const reloadSessionList = useCallback(async () => {
		const list = await sessionControllerRef.current?.listSessions();
		if (list) {
			browsergentStore.getState().sessionListLoaded(list);
		}
	}, [sessionControllerRef]);

	const handleSwitchSession = useCallback(
		async (id: string) => {
			const snapshot = currentSessionSnapshot();
			await sessionControllerRef.current?.flushSave(
				snapshot.messages,
				snapshot.trace,
				snapshot.diagnostics,
			);
			const data = await sessionControllerRef.current?.switchSession(id);
			if (data) {
				browsergentStore.getState().hydrateChat(data.messages);
				browsergentStore.getState().hydrateTrace(data.trace);
				browsergentStore.getState().hydrateDiagnostics(data.diagnostics);
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
		const snapshot = currentSessionSnapshot();
		await sessionControllerRef.current?.flushSave(
			snapshot.messages,
			snapshot.trace,
			snapshot.diagnostics,
		);
		const newId = await sessionControllerRef.current?.createSession();
		if (!newId) return;
		browsergentStore.getState().clearChat();
		browsergentStore.getState().clearTrace();
		browsergentStore.getState().clearDiagnostics();
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
					browsergentStore.getState().hydrateDiagnostics(data.diagnostics);
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

	useEffect(() => {
		const stopped = prevIsRunning.current && !isRunning;
		const canFocus = !isRunning && !showSettings && !sessionPanelOpen && activeTab === "chat";

		if (stopped && canFocus) {
			inputRef.current?.focus();
		} else if (stopped) {
			shouldFocusRef.current = true;
		} else if (shouldFocusRef.current && canFocus) {
			inputRef.current?.focus();
			shouldFocusRef.current = false;
		}

		if (isRunning) {
			shouldFocusRef.current = false;
		}
		prevIsRunning.current = isRunning;
	}, [isRunning, showSettings, sessionPanelOpen, activeTab]);

	return (
		<div
			data-initialized={initialized}
			data-worker-ready={workerReady}
			class="flex flex-col h-screen bg-bg-base relative overflow-hidden"
		>
			{/* Header */}
			<div class="relative z-10 flex items-center justify-between px-md py-sm bg-bg-surface/85 backdrop-blur-[22px] border-b border-border">
				<div class="flex items-center gap-sm text-sm font-semibold tracking-normal text-text-primary">
					<span class="w-2 h-2 rounded-full bg-accent text-accent animate-pulse-glow" />
					Browsergent
				</div>
				<div class="flex items-center gap-sm">
					<div class="flex items-center rounded-full bg-bg-muted border border-border overflow-hidden p-[2px]">
						<button
							type="button"
							onClick={() => browsergentStore.getState().setActiveTab("chat")}
							class={[
								"px-sm py-[3px] text-xs font-medium cursor-pointer transition-all rounded-full",
								activeTab === "chat"
									? "bg-text-primary text-bg-base"
									: "bg-transparent text-text-secondary hover:text-text-primary",
							].join(" ")}
						>
							Chat
						</button>
						<button
							type="button"
							onClick={() => browsergentStore.getState().setActiveTab("js")}
							class={[
								"px-sm py-[3px] text-xs font-medium cursor-pointer transition-all rounded-full",
								activeTab === "js"
									? "bg-text-primary text-bg-base"
									: "bg-transparent text-text-secondary hover:text-text-primary",
							].join(" ")}
						>
							JS
						</button>
					</div>
					<button
						type="button"
						class="flex items-center justify-center w-7 h-7 rounded-md bg-transparent text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-all cursor-pointer"
						onClick={() =>
							browsergentStore
								.getState()
								.sessionPanelOpenChanged(!sessionPanelOpen)
						}
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
			</div>

			{/* Settings modal */}
			{showSettings && (
				<SettingsForm
					onSave={handleSaveApiKey}
					onExport={handleExportConversation}
					onClose={() => browsergentStore.getState().setSettingsOpen(false)}
				/>
			)}

			{/* Main content */}
			<div
				ref={chatScrollRef}
				class="flex-1 overflow-auto p-md relative z-10 flex flex-col gap-md"
			>
				{activeTab === "chat" && messages.length > 0 && !isRunning && (
					<button
						type="button"
						data-testid="floating-new-button"
						aria-label="New session"
						onClick={handleCreateSession}
						class="absolute top-md left-md z-10 w-7 h-7 flex items-center justify-center border border-border-strong rounded-md bg-bg-surface-solid text-text-secondary hover:border-accent hover:text-accent hover:bg-accent-soft transition-all cursor-pointer backdrop-blur-sm"
					>
						<svg width="14" height="14" viewBox="0 0 16 16" fill="none">
							<path
								d="M8 2.5v11M2.5 8h11"
								stroke="currentColor"
								stroke-width="1.5"
								stroke-linecap="round"
							/>
						</svg>
					</button>
				)}
				{activeTab === "chat" ? <ChatPanel /> : <JsPlaybookPanel />}
			</div>

			{/* Status bar */}
			<div class="relative z-10 px-md py-xs bg-bg-base border-t border-border flex items-center gap-sm font-mono text-[10px] text-text-dim tracking-wider uppercase">
				<span
					class={[
						"w-1.5 h-1.5 rounded-full flex-shrink-0",
						status === "idle" || status === "stopped"
							? "bg-text-dim"
							: status === "loading"
								? "bg-warning text-warning animate-pulse-glow"
								: status === "running"
									? "bg-accent text-accent animate-pulse-glow"
									: status === "waiting_for_model"
										? "bg-text-muted text-text-muted animate-pulse-glow"
										: status === "executing_tool"
											? "bg-warning text-warning animate-pulse-glow"
											: status === "done"
												? "bg-success"
												: "bg-danger text-danger ",
					].join(" ")}
				/>
				<span class="flex-1 truncate" data-testid="agent-status">
					{status}
					{statusReason ? ` — ${statusReason}` : ""}
				</span>
				<span class="flex-shrink-0 text-text-muted">{stepCount} steps</span>
			</div>

			{/* Input */}
			{activeTab === "chat" && (
				<InputBar isRunning={isRunning} onRun={handleRun} onStop={handleStop} inputRef={inputRef} />
			)}

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
