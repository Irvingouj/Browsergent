import { useCallback, useMemo, useRef, useState } from "preact/hooks";
import { useStore } from "zustand/react";
import {
	selectMessageIds,
	selectMessagesById,
	selectTaskDraft,
} from "../../../state/selectors";
import { browsergentStore } from "../../../state/store";
import type { ChatMessage } from "../../../types/messages";

export interface InputHistory {
	/** Call in onKeyDown for ArrowUp and ArrowDown events. Returns true if the event was handled. */
	handleKeyDown: (e: KeyboardEvent) => boolean;
	/** Call when the input value changes due to user typing (not history navigation). */
	onInput: () => void;
	/** Call when the task is submitted. */
	onSubmit: () => void;
}

export function useInputHistory(): InputHistory {
	const messageIds = useStore(browsergentStore, selectMessageIds);
	const messagesById = useStore(browsergentStore, selectMessagesById);
	const taskInput = useStore(browsergentStore, selectTaskDraft);

	const userHistory = useMemo(
		() =>
			messageIds
				.map((id) => messagesById[id])
				.filter((m): m is ChatMessage & { kind: "user" } => m?.kind === "user")
				.map((m) => m.text),
		[messageIds, messagesById],
	);

	const [historyIndex, setHistoryIndex] = useState(-1);
	const historyDraftRef = useRef("");

	const reset = useCallback(() => {
		setHistoryIndex(-1);
	}, []);

	const handleKeyDown = useCallback(
		(e: KeyboardEvent): boolean => {
			const el = e.target as HTMLTextAreaElement;

			if (
				e.key === "ArrowUp" &&
				userHistory.length > 0 &&
				el.selectionStart === 0
			) {
				e.preventDefault();
				if (historyIndex === -1) {
					historyDraftRef.current = taskInput;
					const idx = userHistory.length - 1;
					setHistoryIndex(idx);
					browsergentStore.getState().setTaskDraft(userHistory[idx] ?? "");
				} else if (historyIndex > 0) {
					const next = historyIndex - 1;
					setHistoryIndex(next);
					browsergentStore.getState().setTaskDraft(userHistory[next] ?? "");
				}
				return true;
			}

			if (
				e.key === "ArrowDown" &&
				historyIndex >= 0 &&
				el.selectionStart === el.value.length
			) {
				e.preventDefault();
				if (historyIndex < userHistory.length - 1) {
					const next = historyIndex + 1;
					setHistoryIndex(next);
					browsergentStore.getState().setTaskDraft(userHistory[next] ?? "");
				} else {
					setHistoryIndex(-1);
					browsergentStore.getState().setTaskDraft(historyDraftRef.current);
				}
				return true;
			}

			return false;
		},
		[userHistory, taskInput, historyIndex],
	);

	return { handleKeyDown, onInput: reset, onSubmit: reset };
}
