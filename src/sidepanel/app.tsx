import type { FunctionalComponent } from "preact";
import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "preact/hooks";
import { useStore } from "zustand/react";
import {
	buildExportSnapshot,
	exportConversation,
} from "../controllers/export-controller";
import { isTextFile } from "../controllers/files";
import {
	CROSS_WINDOW_SESSION_MESSAGE,
	collectRunningSessionIds,
} from "../controllers/session-window-utils";
import {
	formatDiagSnapshot,
	getMemoryDiagRing,
	readDiagRingFromSession,
	reportError,
} from "../errors/report";
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
	selectBootHealth,
	selectBootHostError,
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
import { defaultModelForProvider } from "../state/slices/settings-slice";
import { browsergentStore } from "../state/store";
import type { ChatMessage } from "../types/messages";
import { WireFormat } from "../worker/provider-schema";
import { ChatPanel } from "./components/ChatPanel";
import { FilesPanel } from "./components/files/FilesPanel";
import { refreshShallowFileTree } from "./components/files/refresh-file-tree";
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
	const bootHealth = useStore(browsergentStore, selectBootHealth);
	const bootHostError = useStore(browsergentStore, selectBootHostError);
	const activeTab = useStore(browsergentStore, selectActiveTab);
	const skillDiagnostics = useStore(browsergentStore, selectSkillDiagnostics);
	const skillIssueTitle = skillDiagnostics
		.map(formatSkillDiagnostic)
		.join("\n");

	const {
		initialized,
		workerReady,
		windowId,
		settingsController,
		supervisorRef,
		onRunningSessionsChangedRef,
		extjsControllerRef,
		settingsControllerRef,
		sessionControllerRef,
		filesControllerRef,
		windowContextRef,
	} = useAppInit();
	const chatScrollRef = useRef<HTMLDivElement | null>(null);
	const inputRef = useRef<HTMLDivElement | null>(null);
	const prevIsRunning = useRef<boolean>(false);
	const shouldFocusRef = useRef<boolean>(false);
	const [runningSessionIds, setRunningSessionIds] = useState<string[]>([]);
	const [globalRunningBySession, setGlobalRunningBySession] = useState<
		Record<string, number>
	>({});
	useTitleGeneration(sessionControllerRef, messages);

	const syncLocalRunningToCoordinator = useCallback(() => {
		const local =
			supervisorRef.current?.getRegistry().getRunningSessionIds() ?? [];
		windowContextRef.current?.reportRunningSessions(local);
		const wid = windowId ?? windowContextRef.current?.getWindowId();
		if (wid !== null && wid !== undefined && sessionControllerRef.current) {
			void sessionControllerRef.current.updateRunningSessionsForWindow(
				wid,
				local,
			);
		}
		return local;
	}, [supervisorRef, windowContextRef, sessionControllerRef, windowId]);

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
					supervisorRef.current?.postToForeground({
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
	}, [supervisorRef]);

	const handleRun = useCallback(
		async (submittedText?: string) => {
			const task = (
				submittedText ?? browsergentStore.getState().ui.taskDraft
			).trim();
			if (!task) return;
			if (!activeProvider?.apiKey) {
				browsergentStore.getState().setActiveTab("settings");
				return;
			}
			const sessionId = sessionControllerRef.current?.getActiveSessionId();
			if (!sessionId) return;

			// Optimistic paint (steer-parity): clear draft + user bubble + loading
			// BEFORE slow preflight (extjs init / skills / files). Without this the
			// input sits full for ~500ms then clears while the user bubble only
			// appears when the worker echoes agentMessage — feels laggy / bouncey.
			browsergentStore.getState().setTaskDraft("");
			browsergentStore.getState().appendUserMessage({
				kind: "user",
				id: crypto.randomUUID(),
				text: task,
				timestamp: Date.now(),
			});
			const runId = crypto.randomUUID();
			browsergentStore.getState().agentRunRequested(runId);

			// Lazy acting host: init extension-js with this panel's windowId on first Run.
			const wid =
				windowId ?? windowContextRef.current?.getWindowId() ?? undefined;
			try {
				await extjsControllerRef.current?.init(
					typeof wid === "number" && wid > 0 ? { windowId: wid } : undefined,
				);
				browsergentStore.getState().bootComponentSet("extjs", "ok");
			} catch (err: unknown) {
				browsergentStore.getState().bootComponentSet("extjs", "fail");
				browsergentStore.getState().appendSystemMessage({
					kind: "system",
					id: crypto.randomUUID(),
					text: `Browser runtime failed to start: ${err instanceof Error ? err.message : String(err)}`,
					timestamp: Date.now(),
				});
				return;
			}

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

			const activeModel = activeProvider
				? defaultModelForProvider(activeProvider)
				: null;
			if (activeProvider && !activeModel) {
				browsergentStore.getState().agentFailed({
					code: "E_BAD_SETTINGS",
					message: "Add a model to the active provider before running a task",
					source: "settings",
				});
				return;
			}

			supervisorRef.current?.registerRun(sessionId, runId);
			const local = syncLocalRunningToCoordinator();
			const persisted =
				sessionControllerRef.current?.getGlobalRunningSessionIds() ?? [];
			const allRunning = collectRunningSessionIds(
				local,
				persisted,
				globalRunningBySession,
			);
			setRunningSessionIds(allRunning);

			supervisorRef.current?.ensureWorkerForSession(sessionId);
			supervisorRef.current?.postToForeground({
				type: "agentStart",
				runId,
				sessionId,
				task,
				resolvedTask,
				skillCatalog,
				activatedSkills,
				settings: activeProvider
					? {
							wireFormat: activeProvider.wireFormat,
							apiKey: activeProvider.apiKey,
							chatEndpointUrl: activeProvider.chatEndpointUrl,
							model: activeModel?.model ?? "",
						}
					: {
							wireFormat: WireFormat.AnthropicMessages,
							apiKey: "",
							chatEndpointUrl: "",
							model: "",
						},
			});
		},
		[
			activeProvider,
			sessionControllerRef,
			supervisorRef,
			extjsControllerRef,
			windowContextRef,
			windowId,
			filesControllerRef,
			syncLocalRunningToCoordinator,
			globalRunningBySession,
		],
	);

	const handleStop = useCallback(() => {
		const runId = browsergentStore.getState().agent.activeRunId;
		supervisorRef.current?.stopForegroundRun(runId);
	}, [supervisorRef]);

	const handleSteer = useCallback(
		(text: string) => {
			const trimmed = text.trim();
			if (!trimmed) return;
			const runId = browsergentStore.getState().agent.activeRunId;
			if (!runId) return;
			browsergentStore.getState().setTaskDraft("");
			// Optimistic bubble so the user always sees what they steered, even if the
			// worker rejects (run just ended / runId race). Worker steerUser no longer
			// emits a second user bubble for the same text.
			browsergentStore.getState().appendUserMessage({
				kind: "user",
				id: crypto.randomUUID(),
				text: trimmed,
				timestamp: Date.now(),
			});
			supervisorRef.current?.postToForeground({
				type: "agentSteer",
				runId,
				text: trimmed,
			});
		},
		[supervisorRef],
	);

	const handleExportConversation = useCallback(() => {
		exportConversation(buildExportSnapshot(messages, trace, diagnostics));
	}, [messages, trace, diagnostics]);

	const refreshFiles = useCallback(async () => {
		const ctrl = filesControllerRef.current;
		if (!ctrl) return;
		try {
			await refreshShallowFileTree(ctrl);
		} catch (err) {
			console.warn("Failed to refresh files:", err);
		}
	}, [filesControllerRef]);

	// Latest global running map for reloadSessionList without putting it in
	// useCallback deps (that caused identity churn → effect storms → IDB flood).
	const globalRunningBySessionRef = useRef(globalRunningBySession);
	globalRunningBySessionRef.current = globalRunningBySession;

	const reloadInFlightRef = useRef<Promise<void> | null>(null);
	const reloadSessionList = useCallback(async () => {
		// Single-flight: concurrent callers share one reload (prevents __meta storms).
		if (reloadInFlightRef.current) {
			await reloadInFlightRef.current;
			return;
		}
		const run = (async () => {
			windowContextRef.current?.requestGlobalRunningSnapshot();
			const ctrl = sessionControllerRef.current;
			const wid = windowId ?? ctrl?.getPanelWindowId() ?? undefined;
			if (!ctrl) return;
			await ctrl.refreshMeta();
			const result = await ctrl.listSessions(wid);
			const local = syncLocalRunningToCoordinator();
			const runningIds = collectRunningSessionIds(
				local,
				ctrl.getGlobalRunningSessionIds(),
				globalRunningBySessionRef.current,
			);
			const runningSet = new Set(runningIds);
			setRunningSessionIds(runningIds);
			browsergentStore.getState().sessionListLoaded(
				result.sessions.map((s) => ({
					...s,
					running: runningSet.has(s.id),
				})),
			);
		})().finally(() => {
			reloadInFlightRef.current = null;
		});
		reloadInFlightRef.current = run;
		await run;
	}, [
		sessionControllerRef,
		windowContextRef,
		windowId,
		syncLocalRunningToCoordinator,
	]);

	useEffect(() => {
		// Running badge updates only — full list reload on every agent event caused IDB storms.
		onRunningSessionsChangedRef.current = () => {
			syncLocalRunningToCoordinator();
			const local =
				supervisorRef.current?.getRegistry().getRunningSessionIds() ?? [];
			const ctrl = sessionControllerRef.current;
			const runningIds = collectRunningSessionIds(
				local,
				ctrl?.getGlobalRunningSessionIds() ?? [],
				globalRunningBySessionRef.current,
			);
			const runningSet = new Set(runningIds);
			setRunningSessionIds(runningIds);
			const current = browsergentStore.getState().session.sessions;
			if (current.length === 0) return;
			browsergentStore.getState().sessionListLoaded(
				current.map((s) => ({
					...s,
					running: runningSet.has(s.id),
				})),
			);
		};
		return () => {
			onRunningSessionsChangedRef.current = null;
		};
	}, [
		onRunningSessionsChangedRef,
		supervisorRef,
		sessionControllerRef,
		syncLocalRunningToCoordinator,
	]);

	useEffect(() => {
		const ctx = windowContextRef.current;
		if (!ctx) return;
		return ctx.subscribeGlobalRunning((message) => {
			setGlobalRunningBySession((prev) => {
				const next = message.bySession;
				const prevKeys = Object.keys(prev);
				const nextKeys = Object.keys(next);
				if (prevKeys.length === nextKeys.length) {
					let same = true;
					for (const k of nextKeys) {
						if (prev[k] !== next[k]) {
							same = false;
							break;
						}
					}
					if (same) return prev;
				}
				return { ...next };
			});
		});
	}, [initialized, windowContextRef]);

	// Global running badge updates: patch in-memory list only — NO refreshMeta/listSessions.
	// (Previously this depended on globalRunningBySession → full IDB reload → write __meta →
	// broadcast → loop: 30k+ concurrent get(__meta) under multi-window.)
	useEffect(() => {
		if (!initialized) return;
		const local =
			supervisorRef.current?.getRegistry().getRunningSessionIds() ?? [];
		const ctrl = sessionControllerRef.current;
		const runningIds = collectRunningSessionIds(
			local,
			ctrl?.getGlobalRunningSessionIds() ?? [],
			globalRunningBySession,
		);
		const runningSet = new Set(runningIds);
		setRunningSessionIds(runningIds);
		const current = browsergentStore.getState().session.sessions;
		if (current.length === 0) return;
		browsergentStore.getState().sessionListLoaded(
			current.map((s) => ({
				...s,
				running: runningSet.has(s.id),
			})),
		);
	}, [
		initialized,
		globalRunningBySession,
		supervisorRef,
		sessionControllerRef,
	]);

	// Full IDB-backed list load: once when shell ready, and when session panel opens.
	useEffect(() => {
		if (!initialized) return;
		void reloadSessionList();
	}, [initialized, reloadSessionList]);

	useEffect(() => {
		if (!initialized || !sessionPanelOpen) return;
		void reloadSessionList();
	}, [initialized, sessionPanelOpen, reloadSessionList]);

	useEffect(() => {
		const ctx = windowContextRef.current;
		const sessionCtrl = sessionControllerRef.current;
		const supervisor = supervisorRef.current;
		if (!ctx || !sessionCtrl) return;
		return ctx.subscribeLifecycle((message) => {
			const run = async () => {
				if (message.kind === "split") {
					void reloadSessionList();
					return;
				}
				if (message.kind === "close") {
					const removed = message.removedWindowId;
					if (typeof removed !== "number") return;
					await sessionCtrl.applyWindowClose(removed);
					void reloadSessionList();
					return;
				}
				if (message.kind === "merge") {
					const removed = message.removedWindowId;
					const survivor = message.survivorWindowId;
					if (typeof removed !== "number" || typeof survivor !== "number") {
						return;
					}
					await sessionCtrl.applyWindowMerge(removed, survivor);
					const panelWid =
						windowId ?? windowContextRef.current?.getWindowId() ?? null;
					if (panelWid === survivor) {
						extjsControllerRef.current?.rebindWindow(survivor);
						const rebound = message.reboundRunningSessionIds ?? [];
						if (rebound.length > 0 && typeof chrome !== "undefined") {
							const { sendMessageSafe } = await import("../errors/report");
							void sendMessageSafe(
								{
									type: "offscreenAdoptRuns",
									sessionIds: rebound,
									windowId: survivor,
								},
								{ source: "lifecycle", op: "offscreenAdoptRuns" },
							);
							void sendMessageSafe(
								{
									type: "offscreenQueryRuns",
									sessionIds: rebound,
								},
								{ source: "lifecycle", op: "offscreenQueryRuns" },
							);
							void sessionCtrl.updateRunningSessionsForWindow(
								survivor,
								rebound,
							);
						}
						for (const sessionId of rebound) {
							const record = await sessionCtrl.getSessionRecord(sessionId);
							if (!record || record.windowId !== survivor) continue;
							const isRunning =
								supervisor?.getRegistry().isRunning(sessionId) ?? false;
							const fresh = await sessionCtrl.loadForSession(sessionId);
							if (!fresh) continue;
							if (isRunning) {
								supervisor?.detachToHeadless(sessionId);
								if (sessionCtrl.getActiveSessionId() === sessionId) {
									supervisor?.attachForeground(sessionId);
								}
								continue;
							}
							if (sessionCtrl.getActiveSessionId() === sessionId) {
								browsergentStore.getState().hydrateChat(fresh.messages);
								browsergentStore.getState().hydrateTrace(fresh.trace);
								browsergentStore
									.getState()
									.hydrateDiagnostics(fresh.diagnostics);
							}
						}
					}
					void reloadSessionList();
				}
			};
			void run().catch((err: unknown) => {
				reportError({
					code: "E_LIFECYCLE",
					source: "lifecycle",
					message: `lifecycle handler failed: ${message.kind}`,
					details: { kind: message.kind },
					cause: err,
				});
			});
		});
	}, [
		initialized,
		windowContextRef,
		sessionControllerRef,
		extjsControllerRef,
		supervisorRef,
		windowId,
		reloadSessionList,
	]);

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
			const sessionCtrl = sessionControllerRef.current;
			const supervisor = supervisorRef.current;
			const wid = windowId ?? sessionCtrl?.getPanelWindowId();
			if (sessionCtrl && wid !== null && wid !== undefined) {
				const openable = await sessionCtrl.canOpenSession(id, wid);
				if (!openable) {
					browsergentStore.getState().appendSystemMessage({
						kind: "system",
						id: crypto.randomUUID(),
						text: CROSS_WINDOW_SESSION_MESSAGE,
						timestamp: Date.now(),
					});
					return;
				}
			}
			const prevId = sessionCtrl?.getActiveSessionId();
			const snapshot = currentSessionSnapshot();
			await sessionCtrl?.flushSave(
				snapshot.messages,
				snapshot.trace,
				snapshot.diagnostics,
			);
			if (
				supervisor &&
				prevId &&
				supervisor.getRegistry().isRunning(prevId) &&
				prevId !== id
			) {
				supervisor.detachToHeadless(prevId);
			}
			const data = await sessionCtrl?.switchSession(id);
			if (data) {
				if (prevId && prevId !== id) {
					await sessionCtrl?.setSessionLifecycle(prevId, "background");
				}
				await sessionCtrl?.setSessionLifecycle(id, "foreground");
				const fresh = await sessionCtrl?.loadForSession(id);
				const payload = fresh ?? data;
				browsergentStore.getState().hydrateChat(payload.messages);
				browsergentStore.getState().hydrateTrace(payload.trace);
				browsergentStore.getState().hydrateDiagnostics(payload.diagnostics);
				await refreshFiles();
				browsergentStore.getState().activeSessionChanged(id);
				if (supervisor) {
					if (supervisor.getRegistry().isRunning(id)) {
						supervisor.attachForeground(id);
					} else {
						supervisor.startForeground(id);
						supervisor.resetForegroundUi();
					}
				}
			} else {
				browsergentStore.getState().appendSystemMessage({
					kind: "system",
					id: crypto.randomUUID(),
					text: "Session not found",
					timestamp: Date.now(),
				});
			}
			clearPendingAutoSkills();
			browsergentStore.getState().sessionPanelOpenChanged(false);
			browsergentStore.getState().setSettingsOpen(false);
			await reloadSessionList();
		},
		[
			reloadSessionList,
			refreshFiles,
			sessionControllerRef,
			supervisorRef,
			windowId,
		],
	);

	const handleCreateSession = useCallback(async () => {
		const sessionCtrl = sessionControllerRef.current;
		const supervisor = supervisorRef.current;
		const prevId = sessionCtrl?.getActiveSessionId();
		const snapshot = currentSessionSnapshot();
		await sessionCtrl?.flushSave(
			snapshot.messages,
			snapshot.trace,
			snapshot.diagnostics,
		);
		if (supervisor && prevId && supervisor.getRegistry().isRunning(prevId)) {
			supervisor.detachToHeadless(prevId);
			await sessionCtrl?.setSessionLifecycle(prevId, "background");
		}
		const newId = await sessionCtrl?.createSession();
		if (!newId) return;
		browsergentStore.getState().clearChat();
		browsergentStore.getState().clearTrace();
		browsergentStore.getState().clearDiagnostics();
		clearPendingAutoSkills();
		if (supervisor) {
			supervisor.startForeground(newId);
			supervisor.resetForegroundUi();
		}
		browsergentStore.getState().sessionCreated(newId);
		browsergentStore.getState().sessionPanelOpenChanged(false);
		await reloadSessionList();
	}, [reloadSessionList, sessionControllerRef, supervisorRef]);

	const handleDeleteSession = useCallback(
		async (id: string) => {
			const sessionCtrl = sessionControllerRef.current;
			const wid = windowId ?? sessionCtrl?.getPanelWindowId();
			if (sessionCtrl && wid !== null && wid !== undefined) {
				const openable = await sessionCtrl.canOpenSession(id, wid);
				if (!openable) {
					browsergentStore.getState().appendSystemMessage({
						kind: "system",
						id: crypto.randomUUID(),
						text: CROSS_WINDOW_SESSION_MESSAGE,
						timestamp: Date.now(),
					});
					return;
				}
			}
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
		[reloadSessionList, refreshFiles, sessionControllerRef, windowId],
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

	const copyHostDiagnostics = useCallback(async () => {
		const swRing = await readDiagRingFromSession();
		const text = [
			"=== memory ring ===",
			formatDiagSnapshot(getMemoryDiagRing()),
			"=== SW ring ===",
			formatDiagSnapshot(swRing),
			"=== boot health ===",
			JSON.stringify(bootHealth, null, 2),
		].join("\n");
		try {
			await navigator.clipboard.writeText(text);
		} catch {
			console.error("[browsergent][error] clipboard write failed\n" + text);
		}
	}, [bootHealth]);

	return (
		<div
			data-initialized={initialized}
			data-worker-ready={workerReady}
			data-window-id={windowId ?? undefined}
			data-boot-idb={bootHealth.idb}
			data-boot-extjs={bootHealth.extjs}
			data-boot-worker={bootHealth.worker}
			data-boot-sw={bootHealth.sw}
			class="flex flex-col h-screen bg-bg-base relative overflow-hidden"
		>
			{bootHostError && (
				<div
					data-testid="host-error-banner"
					class="relative z-20 flex items-start gap-sm border-b border-error bg-error/10 px-md py-xs text-xs text-error shrink-0"
				>
					<span class="flex-1 font-mono">
						[{bootHostError.code}] {bootHostError.message}
						<span class="text-error/70"> · {bootHostError.source}</span>
					</span>
					<button
						type="button"
						class="text-error/80 hover:text-error cursor-pointer underline"
						onClick={() => void copyHostDiagnostics()}
					>
						Copy logs
					</button>
					<button
						type="button"
						class="text-error/70 hover:text-error cursor-pointer px-xs"
						aria-label="Dismiss host error"
						onClick={() => browsergentStore.getState().bootHostErrorDismissed()}
					>
						×
					</button>
				</div>
			)}
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
				class="chat-scroll flex-1 overflow-auto p-md relative z-10 flex flex-col gap-md"
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
						settingsController={settingsController}
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
					onSteer={handleSteer}
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
					panelWindowId={windowId}
					runningSessionIds={runningSessionIds}
					onSwitchSession={handleSwitchSession}
					onCreateSession={handleCreateSession}
					onDeleteSession={handleDeleteSession}
					onUpdateTitle={handleUpdateTitle}
					onBlockedSession={() => {
						browsergentStore.getState().appendSystemMessage({
							kind: "system",
							id: crypto.randomUUID(),
							text: CROSS_WINDOW_SESSION_MESSAGE,
							timestamp: Date.now(),
						});
					}}
					onSettingsClick={() => {
						browsergentStore.getState().setActiveTab("settings");
						browsergentStore.getState().sessionPanelOpenChanged(false);
					}}
					canSwitch
				/>
			)}
		</div>
	);
};

export default App;
