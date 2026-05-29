import type { FunctionalComponent } from "preact";
import { useCallback, useEffect, useState } from "preact/hooks";
import { useStore } from "zustand/react";
import { browsergentStore } from "../state/store";
import type { SessionController } from "../controllers/session-controller";
import type { SessionListItem } from "../state/slices/session-slice";

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
	const [hoveredId, setHoveredId] = useState<string | null>(null);

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
			{/* Overlay mask */}
			<div
				onClick={closePanel}
				style={{
					position: "fixed",
					top: "40px",
					left: 0,
					right: "280px",
					bottom: 0,
					background: "rgba(0,0,0,0.3)",
					zIndex: 100,
				}}
			/>
			{/* Panel */}
			<div
				style={{
					position: "fixed",
					top: "40px",
					right: 0,
					bottom: 0,
					width: "280px",
					background: "#fff",
					borderLeft: "1px solid #e0e0e0",
					zIndex: 101,
					display: "flex",
					flexDirection: "column",
				}}
			>
				{/* Header */}
				<div
					style={{
						padding: "12px",
						borderBottom: "1px solid #e0e0e0",
						display: "flex",
						alignItems: "center",
						gap: "8px",
					}}
				>
					<button
						type="button"
						onClick={onCreateSession}
						style={{
							flex: 1,
							padding: "6px 12px",
							background: "#4a90d9",
							color: "white",
							border: "none",
							borderRadius: "4px",
							cursor: "pointer",
							fontSize: "13px",
						}}
					>
						New Session
					</button>
					<button
						type="button"
						onClick={onSettingsClick}
						style={{
							padding: "6px 12px",
							background: "#f5f5f5",
							border: "1px solid #ccc",
							borderRadius: "4px",
							cursor: "pointer",
							fontSize: "13px",
						}}
					>
						Settings
					</button>
					<button
						type="button"
						data-testid="close-session-panel"
						onClick={closePanel}
						style={{
							padding: "4px 8px",
							background: "none",
							border: "none",
							cursor: "pointer",
							fontSize: "16px",
							color: "#666",
						}}
					>
						×
					</button>
				</div>

				{/* Session list */}
				<div style={{ flex: 1, overflow: "auto" }}>
					{visibleSessions.length === 0 ? (
						<div
							style={{
								padding: "24px 12px",
								textAlign: "center",
								color: "#999",
								fontSize: "13px",
							}}
						>
							No conversations yet
						</div>
					) : (
						visibleSessions.map((session) => {
							const isActive = session.id === activeSessionId;
							const isEditing = editingId === session.id;
							return (
								<div
									key={session.id}
									onClick={() => handleItemClick(session.id)}
									onMouseEnter={() => setHoveredId(session.id)}
									onMouseLeave={() => setHoveredId(null)}
									style={{
										padding: "10px 12px",
										borderBottom: "1px solid #f0f0f0",
										cursor: canSwitch
											? "pointer"
											: "not-allowed",
										borderLeft: isActive
											? "3px solid #4a90d9"
											: "3px solid transparent",
										background: isActive
											? "#f8fbff"
											: "#fff",
										opacity: canSwitch ? 1 : 0.5,
										position: "relative",
									}}
									title={
										canSwitch
											? undefined
											: "Cannot switch while agent is running"
									}
								>
									<div
										style={{
											display: "flex",
											justifyContent: "space-between",
											alignItems: "center",
										}}
									>
										{isEditing ? (
											<input
												type="text"
												value={editValue}
												onInput={(e) =>
													setEditValue(
														(
															e.target as HTMLInputElement
														).value,
													)
												}
												onBlur={handleEditSave}
												onKeyDown={handleEditKeyDown}
												onClick={(e) => e.stopPropagation()}
												style={{
													flex: 1,
													fontSize: "13px",
													fontWeight: "bold",
													padding: "2px 4px",
													border: "1px solid #4a90d9",
													borderRadius: "3px",
													outline: "none",
												}}
												autoFocus
											/>
										) : (
											<span
												onClick={(e) =>
													handleTitleClick(
															e as unknown as MouseEvent,
															session,
														)
												}
												style={{
													fontSize: "13px",
													fontWeight: "bold",
													color: "#333",
													flex: 1,
													overflow: "hidden",
													textOverflow: "ellipsis",
													whiteSpace: "nowrap",
													cursor: canSwitch
														? "text"
														: "not-allowed",
												}}
											>
												{session.title || "Untitled"}
											</span>
										)}
										<button
											type="button"
											onClick={(e) =>
												handleDeleteClick(
													e as unknown as MouseEvent,
													session.id,
												)
											}
											style={{
												marginLeft: "8px",
												padding: "2px 6px",
												background: "none",
												border: "none",
												color: "#d94a4a",
												cursor: "pointer",
												fontSize: "14px",
												opacity:
													hoveredId === session.id
														? 1
														: 0,
												transition: "opacity 0.15s",
											}}
										>
											×
										</button>
									</div>
									<div
										style={{
											fontSize: "11px",
											color: "#999",
											marginTop: "4px",
										}}
									>
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
