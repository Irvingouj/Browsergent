import type { FunctionalComponent } from "preact";
import { useCallback, useState } from "preact/hooks";
import { useStore } from "zustand/react";
import type { SessionController } from "../controllers/session-controller";
import type { SessionListItem } from "../state/slices/session-slice";
import { browsergentStore } from "../state/store";

interface SessionPanelProps {
	sessionController: SessionController;
	panelWindowId: number | null;
	runningSessionIds?: string[];
	onSwitchSession: (id: string) => void;
	/** C1: claim a closed-window session onto this panel, then open it. */
	onClaimClosedSession: (id: string) => void;
	onCreateSession: () => void;
	onDeleteSession: (id: string) => void;
	onUpdateTitle: (id: string, title: string) => void;
	onBlockedSession: () => void;
	onSettingsClick: () => void;
	canSwitch: boolean;
}

function formatRelativeTime(timestamp: number): string {
	const now = Date.now();
	const diff = now - timestamp;
	const minutes = Math.floor(diff / 60000);
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes} min ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours} hr ago`;
	const days = Math.floor(hours / 24);
	return `${days} day${days > 1 ? "s" : ""} ago`;
}

export const SessionPanel: FunctionalComponent<SessionPanelProps> = ({
	sessionController,
	panelWindowId,
	runningSessionIds = [],
	onSwitchSession,
	onClaimClosedSession,
	onCreateSession,
	onDeleteSession,
	onUpdateTitle,
	onBlockedSession,
	onSettingsClick,
	canSwitch,
}) => {
	const sessions = useStore(browsergentStore, (s) => s.session.sessions);
	const activeSessionId = useStore(
		browsergentStore,
		(s) => s.session.activeSessionId,
	);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editValue, setEditValue] = useState("");

	const closePanel = useCallback(() => {
		browsergentStore.getState().sessionPanelOpenChanged(false);
	}, []);

	const handleItemClick = useCallback(
		(session: SessionListItem) => {
			// Claimable closed/orphan rows: whole row claims (don't only bury CTA).
			if (session.claimable === true) {
				onClaimClosedSession(session.id);
				return;
			}
			if (session.openable === false) {
				onBlockedSession();
				return;
			}
			onSwitchSession(session.id);
		},
		[onSwitchSession, onClaimClosedSession, onBlockedSession],
	);

	const handleTitleClick = useCallback(
		(e: MouseEvent, session: SessionListItem) => {
			e.stopPropagation();
			if (session.openable === false) {
				onBlockedSession();
				return;
			}
			setEditingId(session.id);
			setEditValue(session.title);
		},
		[onBlockedSession],
	);

	const handleEditSave = useCallback(() => {
		if (editingId) {
			onUpdateTitle(editingId, editValue);
		}
		setEditingId(null);
	}, [editingId, editValue, onUpdateTitle]);

	const handleEditKeyDown = useCallback(
		(e: KeyboardEvent) => {
			if (e.key === "Enter") {
				e.preventDefault();
				handleEditSave();
			} else if (e.key === "Escape") {
				setEditingId(null);
			}
		},
		[handleEditSave],
	);

	const handleDeleteClick = useCallback(
		(e: MouseEvent, session: SessionListItem) => {
			e.stopPropagation();
			if (session.openable === false) {
				onBlockedSession();
				return;
			}
			if (session.running) {
				return;
			}
			onDeleteSession(session.id);
		},
		[onDeleteSession, onBlockedSession],
	);

	const visibleSessions = sessions.filter(
		(s) =>
			s.messageCount > 0 || s.id === activeSessionId || s.origin === "cli",
	);

	return (
		<>
			<div
				class="fixed top-0 left-0 right-[280px] bottom-0 bg-black/30 backdrop-blur-sm z-[100] animate-fade-in"
				onClick={closePanel}
			/>
			<div class="fixed top-0 right-0 bottom-0 w-[280px] bg-bg-surface-solid border-l border-border z-[101] flex flex-col animate-slide-in-right shadow-md">
				<div class="p-md border-b border-border flex items-center gap-sm bg-bg-muted">
					<button
						type="button"
						data-testid="new-session-button"
						aria-label="New session"
						onClick={onCreateSession}
						class="w-7 h-7 rounded-full flex items-center justify-center cursor-pointer transition-all bg-text-primary text-bg-base hover:bg-text-secondary"
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
					<button
						type="button"
						data-testid="settings-button"
						aria-label="Open settings"
						onClick={() => {
							onSettingsClick();
						}}
						class="w-7 h-7 rounded-full flex items-center justify-center cursor-pointer transition-all bg-bg-surface text-text-secondary border border-border hover:border-border-strong hover:text-text-primary"
					>
						<svg
							width="14"
							height="14"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<circle cx="12" cy="12" r="3" />
							<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
						</svg>
					</button>
					<button
						type="button"
						data-testid="close-session-panel"
						onClick={closePanel}
						class="flex items-center justify-center w-7 h-7 rounded-md bg-transparent text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-all cursor-pointer"
						style={{ fontSize: "16px" }}
					>
						×
					</button>
				</div>

				<div class="flex-1 overflow-auto">
					{visibleSessions.length === 0 ? (
						<div class="flex flex-col items-center justify-center h-full gap-md text-text-muted text-center p-xl">
							<div class="w-12 h-12 rounded-md bg-bg-surface-solid border border-border-strong flex items-center justify-center text-xl text-accent">
								💬
							</div>
							<div class="text-text-muted">No conversations yet</div>
						</div>
					) : (
						visibleSessions.map((session) => {
							const isActive = session.id === activeSessionId;
							const isEditing = editingId === session.id;
							const rowOpenable = session.openable !== false;
							const rowClaimable = session.claimable === true;
							const isRunning = session.running === true;
							return (
								<div
									key={session.id}
									data-testid="session-item"
									data-session-id={session.id}
									data-session-openable={session.openable !== false}
									data-session-claimable={rowClaimable ? "true" : "false"}
									data-session-origin={session.origin}
									onClick={() => handleItemClick(session)}
									class={[
										"group px-md py-sm border-b border-border transition-all relative",
										rowOpenable
											? "cursor-pointer hover:bg-bg-hover"
											: rowClaimable
												? "opacity-80"
												: "opacity-50 cursor-not-allowed",
										isActive ? "bg-accent-soft border-l-2 border-l-accent" : "",
									].join(" ")}
									title={
										rowClaimable
											? "Window closed — use Open in this window"
											: session.openable === false
												? "Open this session in its window"
												: isRunning && !isActive
													? "Agent running in background — click to subscribe"
													: undefined
									}
								>
									<div class="flex items-center">
										{isEditing ? (
											<input
												type="text"
												value={editValue}
												onInput={(e) =>
													setEditValue((e.target as HTMLInputElement).value)
												}
												onBlur={handleEditSave}
												onKeyDown={handleEditKeyDown}
												onClick={(e) => e.stopPropagation()}
												class="w-full bg-bg-base border border-accent rounded-md px-xs py-[2px] text-sm font-semibold text-text-primary outline-none font-sans"
												autoFocus
											/>
										) : (
											<span
												onClick={(e) =>
													handleTitleClick(e as unknown as MouseEvent, session)
												}
												class="text-sm font-semibold text-text-primary truncate flex-1"
												style={{
													cursor: rowOpenable ? "text" : "not-allowed",
												}}
											>
												{session.title || "Untitled"}
											</span>
										)}
										<button
											type="button"
											data-testid="delete-session-button"
											aria-label="Delete session"
											onClick={(e) =>
												handleDeleteClick(e as unknown as MouseEvent, session)
											}
											class="absolute top-sm right-md p-[2px_6px] bg-transparent border-none text-text-dim cursor-pointer text-sm opacity-0 group-hover:opacity-100 hover:text-danger transition-opacity"
										>
											×
										</button>
									</div>
									<div class="text-[10px] text-text-dim mt-xs font-mono flex flex-wrap gap-xs items-center">
										<span>
											{session.messageCount} messages ·{" "}
											{formatRelativeTime(session.timestamp)}
										</span>
										{session.windowLabel ? (
											<span
												data-testid="session-window-badge"
												class="px-[4px] py-[1px] rounded bg-bg-muted border border-border text-[9px]"
											>
												{session.windowLabel}
											</span>
										) : null}
										{session.lifecycle === "background" ? (
											<span
												data-testid="session-lifecycle-badge"
												class="px-[4px] py-[1px] rounded bg-bg-muted border border-border text-[9px]"
											>
												Background
											</span>
										) : null}
										{isRunning ? (
											<span
												data-testid="session-running-badge"
												class="px-[4px] py-[1px] rounded bg-warning/20 border border-warning/40 text-warning text-[9px]"
											>
												Running
											</span>
										) : null}
									</div>
									{rowClaimable ? (
										<button
											type="button"
											data-testid="claim-closed-session"
											onClick={(e) => {
												e.stopPropagation();
												onClaimClosedSession(session.id);
											}}
											class="mt-xs text-[11px] px-sm py-[2px] rounded-md border border-accent text-accent bg-accent-soft hover:bg-accent hover:text-white transition-colors cursor-pointer"
										>
											Open in this window
										</button>
									) : null}
								</div>
							);
						})
					)}
				</div>
			</div>
		</>
	);
};
