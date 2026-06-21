import { useCallback } from "preact/hooks";
import { browsergentStore } from "../../../state/store";

export interface TextAreaCommandsDeps {
	isRunning: boolean;
	onSubmit: () => void;
	/** Called after any text mutation so the picker re-resolves and history records the edit. */
	onAfterEdit: (nextText: string, cursor: number) => void;
}

/**
 * Textarea editing commands: submit (Enter), blur (Escape), delete-word
 * (Ctrl/Alt/Meta+Backspace), delete-to-EOL (Ctrl/Cmd+K), delete-line
 * (Ctrl/Cmd+Shift+K). Keeps the InputBar onKeyDown to a few one-line delegations.
 * Returns a keydown handler that returns true when it consumed the event.
 */
export function useTextAreaCommands({
	isRunning,
	onSubmit,
	onAfterEdit,
}: TextAreaCommandsDeps): (e: KeyboardEvent) => boolean {
	return useCallback(
		(e: KeyboardEvent): boolean => {
			// --- Submit: Enter without Shift (plain or Ctrl/Cmd) ---
			if (e.key === "Enter" && !e.shiftKey && !isRunning) {
				e.preventDefault();
				onSubmit();
				return true;
			}

			// --- Escape: blur textarea (picker handles its own Escape) ---
			if (e.key === "Escape") {
				e.preventDefault();
				(e.target as HTMLTextAreaElement).blur();
				return true;
			}

			// --- Delete previous word: Ctrl/Alt/Meta+Backspace ---
			if (e.key === "Backspace" && (e.ctrlKey || e.altKey || e.metaKey)) {
				e.preventDefault();
				const el = e.target as HTMLTextAreaElement;
				const val = el.value;
				const selStart = el.selectionStart;
				const selEnd = el.selectionEnd;
				let nextText: string;
				let cursor: number;
				if (selStart !== selEnd) {
					nextText = val.slice(0, selStart) + val.slice(selEnd);
					cursor = selStart;
				} else {
					let i = selStart - 1;
					while (i >= 0 && val[i] === " ") i--;
					while (i >= 0 && val[i] !== " ") i--;
					const wordStart = i + 1;
					nextText = val.slice(0, wordStart) + val.slice(selStart);
					cursor = wordStart;
				}
				browsergentStore.getState().setTaskDraft(nextText);
				requestAnimationFrame(() => el.setSelectionRange(cursor, cursor));
				onAfterEdit(nextText, cursor);
				return true;
			}

			// --- Delete to end of line: Ctrl/Cmd+K ---
			if (e.key === "k" && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
				e.preventDefault();
				const el = e.target as HTMLTextAreaElement;
				const pos = el.selectionStart;
				const val = el.value;
				const nextNewline = val.indexOf("\n", pos);
				const end = nextNewline === -1 ? val.length : nextNewline;
				const nextText = val.slice(0, pos) + val.slice(end);
				browsergentStore.getState().setTaskDraft(nextText);
				requestAnimationFrame(() => el.setSelectionRange(pos, pos));
				onAfterEdit(nextText, pos);
				return true;
			}

			// --- Delete entire line: Ctrl/Cmd+Shift+K ---
			if (e.key === "k" && (e.ctrlKey || e.metaKey) && e.shiftKey) {
				e.preventDefault();
				const el = e.target as HTMLTextAreaElement;
				const pos = el.selectionStart;
				const val = el.value;
				const lineStart = val.lastIndexOf("\n", pos - 1) + 1;
				const nextNewline = val.indexOf("\n", pos);
				const lineEnd = nextNewline === -1 ? val.length : nextNewline + 1;
				const nextText = val.slice(0, lineStart) + val.slice(lineEnd);
				const nextCursor = Math.min(lineStart, nextText.length);
				browsergentStore.getState().setTaskDraft(nextText);
				requestAnimationFrame(() => el.setSelectionRange(nextCursor, nextCursor));
				onAfterEdit(nextText, nextCursor);
				return true;
			}

			return false;
		},
		[isRunning, onSubmit, onAfterEdit],
	);
}
