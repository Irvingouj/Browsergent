import type { StoreApi } from "zustand/vanilla";
import type { BrowsergentError } from "../../errors/browsergent-error";
import type { BrowsergentStore } from "../store";

export interface SessionListItem {
	id: string;
	title: string;
	timestamp: number;
	messageCount: number;
}

export interface SessionState {
	sessions: SessionListItem[];
	activeSessionId: string | null;
	sessionPanelOpen: boolean;
	error?: BrowsergentError;
}

export interface SessionSlice {
	session: SessionState;
	sessionPanelOpenChanged(open: boolean): void;
	sessionListLoaded(sessions: SessionListItem[]): void;
	activeSessionChanged(id: string): void;
	sessionTitleUpdated(id: string, title: string): void;
	sessionDeleted(id: string): void;
	sessionCreated(id: string): void;
	sessionStoreFailed(error: BrowsergentError): void;
	sessionErrorDismissed(): void;
}

export function createSessionSlice(
	set: StoreApi<BrowsergentStore>["setState"],
): SessionSlice {
	return {
		session: {
			sessions: [],
			activeSessionId: null,
			sessionPanelOpen: false,
		},
		sessionPanelOpenChanged(open) {
			set((state) => ({
				session: { ...state.session, sessionPanelOpen: open },
			}));
		},
		sessionListLoaded(sessions) {
			set((state) => ({ session: { ...state.session, sessions } }));
		},
		activeSessionChanged(id) {
			set((state) => ({ session: { ...state.session, activeSessionId: id } }));
		},
		sessionTitleUpdated(id, title) {
			set((state) => {
				const nextSessions = state.session.sessions.map((s) =>
					s.id === id ? { ...s, title } : s,
				);
				return { session: { ...state.session, sessions: nextSessions } };
			});
		},
		sessionDeleted(id) {
			set((state) => {
				const nextSessions = state.session.sessions.filter((s) => s.id !== id);
				const nextActiveId =
					state.session.activeSessionId === id
						? null
						: state.session.activeSessionId;
				return {
					session: {
						...state.session,
						sessions: nextSessions,
						activeSessionId: nextActiveId,
					},
				};
			});
		},
		sessionCreated(id) {
			set((state) => {
				const newSession: SessionListItem = {
					id,
					title: `Session ${id.slice(0, 8)}`,
					timestamp: Date.now(),
					messageCount: 0,
				};
				return {
					session: {
						...state.session,
						sessions: [newSession, ...state.session.sessions],
						activeSessionId: id,
					},
				};
			});
		},
		sessionStoreFailed(error) {
			set((state) => ({ session: { ...state.session, error } }));
		},
		sessionErrorDismissed() {
			set((state) => ({ session: { ...state.session, error: undefined } }));
		},
	};
}
