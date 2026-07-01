import type { FunctionalComponent } from "preact";
import { useCallback, useEffect, useMemo, useRef } from "preact/hooks";
import { useStore } from "zustand/react";
import {
	buildExportSnapshot,
	exportConversation,
} from "../controllers/export-controller";
import { isTextFile } from "../controllers/files";
import {
	buildSkillXmlBlock,
	parseSkillActivation,
} from "../skills/resolve-skill-activations";
import { getSkillService } from "../skills/skill-service";
import type { SkillDiagnostic } from "../skills/skill-types";
import { matchSkillsToUrl } from "../skills/url-match";
import {
	selectActiveProvider,
	selectActiveSessionId,
	selectActiveTab,
	selectAgentStatus,
	selectAgentStatusReason,
	selectDiagnosticEvents,
	selectMessageIds,
	selectMessagesById,
	selectRetryState,
	selectSessionError,
	selectSessionPanelOpen,
	selectSessions,
	selectSettingsOpen,
	selectSkillDiagnostics,
	selectTraceEntries,
} from "../state/selectors";
import { browsergentStore } from "../state/store";
import type { ChatMessage } from "../types/messages";
import { ChatPanel } from "./components/ChatPanel";
import { FilesPanel } from "./components/files/FilesPanel";
import { InputBar } from "./components/input/InputBar";
import { SettingsPanel } from "./components/SettingsPanel";
import { useAppInit } from "./components/use-app-init";
import { useTitleGeneration } from "./components/use-title-generation";
import { mergeSkillAndFileAttachments } from "./merge-run-task";
import {
	addPendingAutoSkill,
	clearPendingAutoSkills,
	drainPendingAutoSkills,
} from "./pending-auto-skills";
import type { DirContextChild } from "./resolve-dir-mentions";
import {
	buildDirContextXmlBlock,
	dedupeDirMentionsById,
	parseDirMentions,
} from "./resolve-dir-mentions";
import {
	parseFileMentions,
	resolveFileMentions,
} from "./resolve-file-mentions";
import {
	buildTabContextXmlBlock,
	parseTabMentions,
	resolveTabMentions,
} from "./resolve-tab-mentions";
import { SessionPanel } from "./session-panel";
import { getUrlTracker } from "./url-tracker";

function formatSkillDiagnostic(diagnostic: SkillDiagnostic): string {
	if (diagnostic.kind === "validation") {
		return `${diagnostic.path}: ${diagnostic.message}`;
	}
	return `collision "${diagnostic.name}": ${diagnostic.loserPath} replaced by ${diagnostic.winnerPath}`;
}

function statusDotClass(isRetrying: boolean, status: string): string {
	if (isRetrying) return "bg-warning text-warning animate-pulse-glow";
	switch (status) {
		case "idle":
		case "stopped":
			return "bg-text-dim";
		case "loading":
			return "bg-warning text-warning animate-pulse-glow";
		case "running":
			return "bg-accent text-accent animate-pulse-glow";
		case "waiting_for_model":
			return "bg-text-muted text-text-muted animate-pulse-glow";
		case "executing_tool":
			return "bg-warning text-warning animate-pulse-glow";
		case "done":
			return "bg-success";
		default:
			return "bg-danger text-danger";
	}
}

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
	const retryState = useStore(browsergentStore, selectRetryState);
	const activeProvider = useStore(browsergentStore, selectActiveProvider);
	const showSettings = useStore(browsergentStore, selectSettingsOpen);
	const sessionPanelOpen = useStore(browsergentStore, selectSessionPanelOpen);
	const _sessions = useStore(browsergentStore, selectSessions);
	const _activeSessionId = useStore(browsergentStore, selectActiveSessionId);
	const sessionError = useStore(browsergentStore, selectSessionError);
	const activeTab = useStore(browsergentStore, selectActiveTab);
	const skillDiagnostics = useStore(browsergentStore, selectSkillDiagnostics);
	const skillIssueTitle = skillDiagnostics
		.map(formatSkillDiagnostic)
		.join("\n");

	const {
		initialized,
		workerReady,
		bridgeRef,
		extjsControllerRef: _extjsControllerRef,
		settingsControllerRef,
		sessionControllerRef,
		filesControllerRef,
	} = useAppInit();
	const chatScrollRef = useRef<HTMLDivElement | null>(null);
	const inputRef = useRef<HTMLDivElement | null>(null);
	const prevIsRunning = useRef<boolean>(false);
	const shouldFocusRef = useRef<boolean>(false);
	useTitleGeneration(sessionControllerRef, messages);

	useEffect(() => {
		const snapshot = currentSessionSnapshot();
		sessionControllerRef.current?.scheduleSave(
			snapshot.messages,
			snapshot.trace,
			snapshot.diagnostics,
		);
	}, [messages, trace, diagnostics, sessionControllerRef]);

	useEffect(() => {
		const el = chatScrollRef.current;
		if (!el) return;
		el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
	}, [messages, trace]);

	// Surface session storage failures via the existing system-message channel.
	useEffect(() => {
		if (!sessionError) return;
		browsergentStore.getState().appendSystemMessage({
			kind: "system",
			id: crypto.randomUUID(),
			text: `Session storage error: ${sessionError.message}`,
			timestamp: Date.now(),
		});
		browsergentStore.getState().sessionErrorDismissed();
	}, [sessionError]);

	// Subscribe to URL changes: match environmental skills, dispatch when
	// running, stage when idle.
	useEffect(() => {
		const tracker = getUrlTracker();
		const unsub = tracker.subscribe(async (state) => {
			const url = state.currentUrl;
			if (!url) return;
			let matched: ReturnType<typeof matchSkillsToUrl>;
			try {
				matched = matchSkillsToUrl(await getSkillService().listSkills(), url);
			} catch (err: unknown) {
				console.warn("[auto-skill] failed to list skills:", err);
				return;
			}
			if (matched.length === 0) return;
			for (const skill of matched) {
				let body: string;
				try {
					body = await getSkillService().loadSkill(skill.name, undefined, {
						source: "tool",
					});
				} catch (err: unknown) {
					console.warn(
						"[auto-skill] failed to load skill body:",
						skill.name,
						err,
					);
					continue;
				}
				// Re-read state after the async load: the run may have ended or
				// switched. Stale steers from a prior run are dropped by the
				// worker's runId guard regardless, but avoid posting them here.
				const agentState = browsergentStore.getState().agent;
				const isRunning =
					agentState.status === "loading" ||
					agentState.status === "running" ||
					agentState.status === "waiting_for_model" ||
					agentState.status === "executing_tool";
				if (isRunning && agentState.activeRunId) {
					bridgeRef.current?.post({
						type: "skillAutoActivate",
						runId: agentState.activeRunId,
						skillName: skill.name,
						skillBody: body,
						url,
					});
				} else {
					addPendingAutoSkill(skill.name);
				}
			}
		});
		return unsub;
	}, [bridgeRef]);

	const handleRun = useCallback(async () => {
		const task = browsergentStore.getState().ui.taskDraft.trim();
		if (!task) return;
		if (!activeProvider?.apiKey) {
			browsergentStore.getState().setActiveTab("settings");
			return;
		}
		const sessionId = sessionControllerRef.current?.getActiveSessionId();
		if (!sessionId) return;

		let resolvedTask = task;
		let skillCatalog = "";
		let activatedSkills: string[] = [];
		try {
			const resolved = await getSkillService().resolveRunTask(task);
			resolvedTask = resolved.resolvedTask;
			skillCatalog = resolved.skillCatalog;
			activatedSkills = resolved.activatedSkills;
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

		// Idle-path environmental skills: drain staged names, load each body,
		// and bake into resolvedTask (parity with the running-path steer and
		// the compose-time /skill: injection). Without this an idle-matched
		// skill only appeared in the catalog; the LLM never saw its body.
		const pendingSkillNames = drainPendingAutoSkills();
		if (pendingSkillNames.length > 0) {
			activatedSkills = Array.from(
				new Set([...activatedSkills, ...pendingSkillNames]),
			);
			try {
				const allSkills = await getSkillService().listSkills();
				const url = getUrlTracker().getCurrentUrl();
				const blocks: string[] = [];
				for (const name of pendingSkillNames) {
					const meta = allSkills.find((s) => s.name === name);
					if (!meta) continue;
					const body = await getSkillService().loadSkill(name, undefined, {
						source: "tool",
					});
					const inner = buildSkillXmlBlock(meta, body);
					blocks.push(
						url
							? `<navigation_trigger url="${url}">${inner}</navigation_trigger>`
							: inner,
					);
				}
				if (blocks.length > 0) {
					resolvedTask = `${resolvedTask}\n${blocks.join("\n")}`;
				}
			} catch (err: unknown) {
				console.warn("[auto-skill] failed to bake idle skills:", err);
			}
		}

		// Resolve file mentions
		const fileMentions = parseFileMentions(task);
		if (fileMentions.length > 0) {
			const filesController = filesControllerRef.current;
			if (!filesController) {
				browsergentStore.getState().appendSystemMessage({
					kind: "system",
					id: crypto.randomUUID(),
					text: "File attachment failed: files controller not available",
					timestamp: Date.now(),
				});
				return;
			}
			try {
				const attachments = await resolveFileMentions(
					fileMentions,
					filesController,
				);
				resolvedTask = mergeSkillAndFileAttachments(
					task,
					resolvedTask,
					attachments,
				);
			} catch (err: unknown) {
				const message = err instanceof Error ? err.message : String(err);
				browsergentStore.getState().appendSystemMessage({
					kind: "system",
					id: crypto.randomUUID(),
					text: `File attachment failed: ${message}`,
					timestamp: Date.now(),
				});
				return;
			}
		}

		// Resolve @[dir:...] mentions: list their immediate children so the agent
		// knows what's inside without wasting turns on file_list.
		const dirMentions = parseDirMentions(task);
		if (dirMentions.length > 0) {
			const filesController = filesControllerRef.current;
			const deduped = dedupeDirMentionsById(dirMentions);
			if (filesController) {
				const blocks: string[] = [];
				for (const mention of deduped) {
					let children: DirContextChild[] = [];
					try {
						const nodes = await filesController.listDirectChildren(
							mention.path,
						);
						children = nodes.map(
							(node): DirContextChild => ({
								name: node.name,
								path: node.path,
								kind: node.kind,
								size: node.size ?? 0,
								isText: isTextFile(node.name),
							}),
						);
					} catch {
						// degrade gracefully: emit note form on failure
					}
					blocks.push(buildDirContextXmlBlock(mention, children));
				}
				const dirBlock = blocks.join("\n");
				if (dirBlock) {
					resolvedTask = `${resolvedTask}\n${dirBlock}`;
				}
			}
		}

		// Resolve @-mentioned open tabs: inject tabId/url/title so the agent can act on a specific tab.
		const tabMentions = parseTabMentions(task);
		if (tabMentions.length > 0) {
			try {
				const resolved = await resolveTabMentions(tabMentions);
				const missing = resolved.filter(
					(
						r,
					): r is {
						ok: false;
						missing: { tabId: string; displayName: string };
					} => !r.ok,
				);
				if (missing.length > 0) {
					const labels = missing
						.map((m) => `@[tab:${m.missing.tabId}:${m.missing.displayName}]`)
						.join(", ");
					browsergentStore.getState().appendSystemMessage({
						kind: "system",
						id: crypto.randomUUID(),
						text: `Tab reference failed: no open tab for ${labels}`,
						timestamp: Date.now(),
					});
					return;
				}
				const tabBlock = resolved
					.map((r) => (r.ok ? r.tab : null))
					.filter((t): t is NonNullable<typeof t> => t !== null)
					.map((t) => buildTabContextXmlBlock(t))
					.join("\n");
				if (tabBlock) {
					resolvedTask = `${resolvedTask}\n${tabBlock}`;
				}
			} catch (err: unknown) {
				const message = err instanceof Error ? err.message : String(err);
				browsergentStore.getState().appendSystemMessage({
					kind: "system",
					id: crypto.randomUUID(),
					text: `Tab reference failed: ${message}`,
					timestamp: Date.now(),
				});
				return;
			}
		}

		// Append timestamp as footnote so system prompt stays stable for prefix caching.
		const now = new Date().toISOString();
		resolvedTask = `${resolvedTask}\n\n[Current time: ${now}]`;

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
			activatedSkills,
			settings: activeProvider
				? {
						kind: activeProvider.kind,
						apiKey: activeProvider.apiKey,
						baseUrl: activeProvider.baseUrl || undefined,
						model: activeProvider.model,
					}
				: { kind: "anthropic", apiKey: "", model: "" },
		});
	}, [activeProvider, sessionControllerRef, bridgeRef, filesControllerRef]);

	const handleStop = useCallback(() => {
		const runId = browsergentStore.getState().agent.activeRunId;
		bridgeRef.current?.post({ type: "agentStop", runId });
	}, [bridgeRef]);

	const handleExportConversation = useCallback(() => {
		exportConversation(buildExportSnapshot(messages, trace, diagnostics));
	}, [messages, trace, diagnostics]);

	const refreshFiles = useCallback(async () => {
		const ctrl = filesControllerRef.current;
		if (!ctrl) return;
		try {
			const nodes = await ctrl.listAllFiles();
			browsergentStore.getState().setFileNodes(nodes);
		} catch (err) {
			console.warn("Failed to refresh files:", err);
		}
	}, [filesControllerRef]);

	const reloadSessionList = useCallback(async () => {
		const result = await sessionControllerRef.current?.listSessions();
		if (result) {
			browsergentStore.getState().sessionListLoaded(result.sessions);
		}
	}, [sessionControllerRef]);

	const handleFilesChanged = useCallback(() => {
		const snapshot = currentSessionSnapshot();
		void sessionControllerRef.current?.flushSave(
			snapshot.messages,
			snapshot.trace,
			snapshot.diagnostics,
		);
		// Create/delete/rename/move mutate OPFS then call onFilesChanged; re-list
		// the tree so the new node appears. FilesPanel's mount-load effect no
		// longer re-lists on filesVersion (that caused a feedback loop that
		// wiped the selection and broke the preview), so mutations must refresh
		// explicitly.
		void refreshFiles();
	}, [sessionControllerRef, refreshFiles]);

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
				await refreshFiles();
				browsergentStore.getState().activeSessionChanged(id);
			} else {
				browsergentStore.getState().appendSystemMessage({
					kind: "system",
					id: crypto.randomUUID(),
					text: "Session not found",
					timestamp: Date.now(),
				});
			}
			browsergentStore.getState().agentReset();
			clearPendingAutoSkills();
			browsergentStore.getState().sessionPanelOpenChanged(false);
			browsergentStore.getState().setSettingsOpen(false);
			await reloadSessionList();
		},
		[reloadSessionList, refreshFiles, sessionControllerRef],
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
		browsergentStore.getState().agentReset();
		clearPendingAutoSkills();
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
					await refreshFiles();
				}
				browsergentStore.getState().activeSessionChanged(activeId);
			}
			await reloadSessionList();
		},
		[reloadSessionList, refreshFiles, sessionControllerRef],
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
		const canFocus =
			!isRunning && !showSettings && !sessionPanelOpen && activeTab === "chat";

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
			<div class="relative z-10 flex items-center justify-end px-md py-sm bg-bg-surface/85 backdrop-blur-[22px] border-b border-border shrink-0">
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
							onClick={() => browsergentStore.getState().setActiveTab("files")}
							class={[
								"px-sm py-[3px] text-xs font-medium cursor-pointer transition-all rounded-full",
								activeTab === "files"
									? "bg-text-primary text-bg-base"
									: "bg-transparent text-text-secondary hover:text-text-primary",
							].join(" ")}
						>
							Files
						</button>
						<button
							type="button"
							onClick={() =>
								browsergentStore.getState().setActiveTab("settings")
							}
							class={[
								"px-sm py-[3px] text-xs font-medium cursor-pointer transition-all rounded-full",
								activeTab === "settings"
									? "bg-text-primary text-bg-base"
									: "bg-transparent text-text-secondary hover:text-text-primary",
							].join(" ")}
						>
							Settings
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

			{/* Settings lives in its own tab now — see SettingsPanel render in Main content. */}
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
				{activeTab === "chat" ? (
					<ChatPanel />
				) : activeTab === "settings" ? (
					<SettingsPanel
						settingsController={settingsControllerRef.current}
						onExportConversation={handleExportConversation}
					/>
				) : initialized && filesControllerRef.current ? (
					<FilesPanel
						filesController={filesControllerRef.current}
						onFilesChanged={handleFilesChanged}
					/>
				) : (
					<div
						data-testid="files-panel-loading"
						class="flex flex-1 items-center justify-center text-sm text-text-muted"
					>
						Loading files…
					</div>
				)}
			</div>

			{/* Status bar */}
			<div class="relative z-10 px-md py-xs bg-bg-base border-t border-border flex items-center gap-sm font-mono text-[10px] text-text-dim tracking-wider uppercase shrink-0">
				<span
					class={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusDotClass(retryState !== null, status)}`}
				/>
				<span class="flex-1 truncate" data-testid="agent-status">
					{retryState
						? `retry ${retryState.attempt}/${retryState.maxAttempts} · ${(retryState.delayMs / 1000).toFixed(1)}s · ${retryState.errorLabel}`
						: `${status}${statusReason ? ` — ${statusReason}` : ""}`}
				</span>
				{skillDiagnostics.length > 0 ? (
					<span
						class="flex-shrink-0 text-warning normal-case tracking-normal"
						data-testid="skill-diagnostics"
						title={skillIssueTitle}
					>
						{skillDiagnostics.length} skill issue
						{skillDiagnostics.length === 1 ? "" : "s"}
					</span>
				) : null}
				<span class="flex-shrink-0 text-text-muted">{stepCount} steps</span>
			</div>

			{/* Input */}
			{activeTab === "chat" && (
				<InputBar
					isRunning={isRunning}
					onRun={handleRun}
					onStop={handleStop}
					inputRef={inputRef}
					filesController={filesControllerRef.current}
					sessionId={_activeSessionId ?? ""}
					onFilesChanged={handleFilesChanged}
				/>
			)}

			{sessionPanelOpen && sessionControllerRef.current && (
				<SessionPanel
					sessionController={sessionControllerRef.current}
					onSwitchSession={handleSwitchSession}
					onCreateSession={handleCreateSession}
					onDeleteSession={handleDeleteSession}
					onUpdateTitle={handleUpdateTitle}
					onSettingsClick={() => {
						browsergentStore.getState().setActiveTab("settings");
						browsergentStore.getState().sessionPanelOpenChanged(false);
					}}
					canSwitch={!isRunning}
				/>
			)}
		</div>
	);
};

export default App;
