import { detectAtState, detectSlashState } from "../../detect-mention-state";

export type InputMode =
	| { kind: "picker-at"; query: string; startIndex: number; endIndex: number; activeIndex: number }
	| { kind: "picker-slash"; query: string; startIndex: number; activeIndex: number }
	| { kind: "history"; index: number; savedDraft: string }
	| { kind: "plain" };

export const CLOSED_MODE: InputMode = { kind: "plain" };

export interface KeyAction {
	type: "prevent-default" | "allow-default";
	effect?:
		| "select-active"
		| "dismiss-picker"
		| "submit"
		| "restore-draft"
		| "recall-history"
		| "delete-word"
		| "delete-to-eol"
		| "delete-line";
	recallDirection?: "older" | "newer";
	nextMode?: InputMode;
}

export interface KeyActionCtx {
	itemCount: number;
	caretAtStart: boolean;
	caretAtEnd: boolean;
	isRunning: boolean;
}

function textEditEffect(e: KeyboardEvent): KeyAction["effect"] | null {
	if (e.key === "Backspace" && (e.ctrlKey || e.altKey || e.metaKey)) {
		return "delete-word";
	}
	if (e.key === "k" && (e.ctrlKey || e.metaKey)) {
		return e.shiftKey ? "delete-line" : "delete-to-eol";
	}
	return null;
}

export function resolveInputMode(
	value: string,
	cursor: number,
	prev: InputMode,
): InputMode {
	const atResult = detectAtState(value, cursor);
	if (atResult) {
		const sameQuery =
			prev.kind === "picker-at" && prev.query === atResult.query;
		return {
			kind: "picker-at",
			query: atResult.query,
			startIndex: atResult.startIndex,
			endIndex: atResult.endIndex,
			activeIndex: sameQuery ? prev.activeIndex : 0,
		};
	}

	const slashResult = detectSlashState(value, cursor);
	if (slashResult) {
		const sameQuery =
			prev.kind === "picker-slash" && prev.query === slashResult.query;
		return {
			kind: "picker-slash",
			query: slashResult.query,
			startIndex: slashResult.startIndex,
			activeIndex: sameQuery ? prev.activeIndex : 0,
		};
	}

	return CLOSED_MODE;
}

function ensureSelectActive(_mode: InputMode, ctx: KeyActionCtx): KeyAction | null {
	if (ctx.itemCount === 0) return null;
	return {
		type: "prevent-default",
		effect: "select-active",
		nextMode: { kind: "plain" },
	};
}

function movePickerActive(mode: InputMode, delta: -1 | 1, ctx: KeyActionCtx): KeyAction {
	if (mode.kind === "plain" || mode.kind === "history") return { type: "prevent-default" };
	const nextIndex = mode.activeIndex + delta;
	const clamped = Math.max(0, Math.min(nextIndex, ctx.itemCount - 1));
	return {
		type: "prevent-default",
		nextMode: { ...mode, activeIndex: clamped } as InputMode,
	};
}

export function interpretKey(
	mode: InputMode,
	e: KeyboardEvent,
	ctx: KeyActionCtx,
): KeyAction | null {
	switch (mode.kind) {
		case "picker-at":
		case "picker-slash": {
			if (e.key === "Escape") {
				return { type: "prevent-default", effect: "dismiss-picker", nextMode: { kind: "plain" } };
			}
			if (e.key === "Enter" || (e.key === "Tab" && !e.shiftKey)) {
				const sel = ensureSelectActive(mode, ctx);
				if (sel) return sel;
				// zero items → fall through to submit
				return { type: "prevent-default", effect: "submit" };
			}
			if ((e.key === "ArrowDown" || e.key === "ArrowUp") && ctx.itemCount > 0)
				return movePickerActive(mode, e.key === "ArrowDown" ? 1 : -1, ctx);
			return null;
		}
		case "history": {
			const edit = textEditEffect(e);
			if (edit) return { type: "prevent-default", effect: edit };
			if (e.key === "Escape") {
				return { type: "prevent-default", effect: "restore-draft", nextMode: { kind: "plain" } };
			}
			if (e.key === "Enter" && !e.shiftKey && !ctx.isRunning) {
				return { type: "prevent-default", effect: "submit" };
			}
			if (e.key === "ArrowDown" && ctx.caretAtEnd) {
				return {
					type: "prevent-default",
					effect: "recall-history",
					recallDirection: "newer",
				};
			}
			if (e.key === "ArrowUp" && ctx.caretAtStart) {
				return {
					type: "prevent-default",
					effect: "recall-history",
					recallDirection: "older",
					nextMode: { ...mode },
				};
			}
			return null;
		}
		case "plain":
			if (e.key === "Escape") {
				return null; // hook will blur; no preventDefault needed
			}
			if (e.key === "Enter" && !e.shiftKey && !ctx.isRunning) {
				return { type: "prevent-default", effect: "submit" };
			}
			if (e.key === "ArrowUp" && ctx.caretAtStart) {
				return {
					type: "prevent-default",
					effect: "recall-history",
					recallDirection: "older",
					nextMode: { kind: "history", index: -1, savedDraft: "" },
				};
			}
			{
				const edit = textEditEffect(e);
				if (edit) return { type: "prevent-default", effect: edit };
			}
			return null;
	}
}
