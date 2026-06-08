import type { FunctionalComponent } from "preact";
import { useCallback, useEffect, useState } from "preact/hooks";
import { useStore } from "zustand/react";
import type { SessionController } from "../controllers/session-controller";
import type { SessionListItem } from "../state/slices/session-slice";
import { browsergentStore } from "../state/store";

interface SessionPanelProps {
	sessionController: SessionController;
	onSwitchSession: (id: string) => void;
	onCreateSession: () => void;
	onDeleteSession: (id: string) => void;
	onUpdateTitle: (id: string, title: string) => void;
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
	onSwitchSession,
	onCreateSession,
	onDeleteSession,
	onUpdateTitle,
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

	useEffect(() => {
		sessionController.listSessions().then((list) => {
			browsergentStore.getState().sessionListLoaded(list);
		});
	}, [sessionController]);

	const closePanel = useCallback(() => {
		browsergentStore.getState().sessionPanelOpenChanged(false);
	}, []);

	const handleItemClick = useCallback(
		(id: string) => {
			if (!canSwitch) return;
			onSwitchSession(id);
		},
		[canSwitch, onSwitchSession],
	);

	const handleTitleClick = useCallback(
		(e: MouseEvent, session: SessionListItem) => {
			e.stopPropagation();
			setEditingId(session.id);
			setEditValue(session.title);
		},
		[],
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
		(e: MouseEvent, id: string) => {
			e.stopPropagation();
			onDeleteSession(id);
		},
		[onDeleteSession],
	);

	const visibleSessions = sessions.filter(
		(s) => s.messageCount > 0 || s.id === activeSessionId,
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
							return (
								<div
									key={session.id}
									onClick={() => handleItemClick(session.id)}
									class={[
										"group px-md py-sm border-b border-border cursor-pointer transition-all relative",
										!canSwitch
											? "opacity-40 cursor-not-allowed"
											: "hover:bg-bg-hover",
										isActive ? "bg-accent-soft border-l-2 border-l-accent" : "",
									].join(" ")}
									title={
										canSwitch
											? undefined
											: "Cannot switch while agent is running"
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
													cursor: canSwitch ? "text" : "not-allowed",
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
												handleDeleteClick(
													e as unknown as MouseEvent,
													session.id,
												)
											}
											class="absolute top-sm right-md p-[2px_6px] bg-transparent border-none text-text-dim cursor-pointer text-sm opacity-0 group-hover:opacity-100 hover:text-danger transition-opacity"
										>
											×
										</button>
									</div>
									<div class="text-[10px] text-text-dim mt-xs font-mono">
										{session.messageCount} messages ·{" "}
										{formatRelativeTime(session.timestamp)}
									</div>
								</div>
							);
						})
					)}
				</div>
			</div>
		</>
	);
};
