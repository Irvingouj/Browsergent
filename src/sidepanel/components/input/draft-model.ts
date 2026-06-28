/**
 * Domain model for the task input. Pure data + pure functions. No DOM, no
 * React, no store. This is the canonical representation of "what's in the
 * input box and where the cursor is".
 *
 * Design principles (see input refactor discussion):
 * - Cursor is NOT a number. It is the boundary between `left` and `right`.
 *   Invalid cursor positions (past end, inside a chip) are unrepresentable.
 * - Every user/programmatic action is an `EditorCommand` variant; behavior
 *   lives in an exhaustive `switch` in `applyCommand`, not scattered across
 *   imperative handlers.
 * - `taskDraft` (the store's canonical string) is the persistence format;
 *   `Draft` is its structured, cursor-aware view. Conversion happens only at
 *   the edges (serialize on submit/persist, parse on session load).
 * - Text is a run (`string`), not per-grapheme. Grapheme correctness matters
 *   only for cursor↔DOM mapping, handled at the bridge layer.
 */

import { type Block, parseBlocks } from "./chip-model";

export type ChipKind = "dir" | "file" | "tab" | "skill";

/**
 * One inline element of the draft. Either a run of plain text or an atomic
 * chip (file/dir/tab/skill mention). Chips carry their canonical `raw` token
 * so the draft serializes back to the exact store string.
 */
export type Inline =
	| { readonly kind: "text"; readonly value: string }
	| {
			readonly kind: "chip";
			readonly chipKind: ChipKind;
			readonly raw: string;
			readonly label: string;
			readonly title: string | null;
	  };

/**
 * The draft, split at the cursor. `left` holds items before the cursor,
 * `right` holds items after. The cursor is the gap between them — it has no
 * index, no length, cannot be "inside" a chip.
 *
 * design: 永远不要把 cursor 表示成 number。number 会制造 cursorIndex > length、
 * cursor 落在 chip 中间等非法状态。zipper 让这些状态物理上不存在(AGENTS.md 第5条)。
 */
export interface Draft {
	readonly left: readonly Inline[];
	readonly right: readonly Inline[];
}

export const emptyDraft = (): Draft => ({ left: [], right: [] });

/**
 * A single user or programmatic action on the draft. Every state change goes
 * through one of these. The reducer (`applyCommand`) is exhaustive over this
 * union; adding a variant is a compile error until handled.
 *
 * design: native editing (typing, browser-driven backspace, IME) does NOT go
 * through here — the browser owns the DOM during typing, and we read the
 * resulting draft back via `parseDraft` at the bridge layer. These commands
 * cover programmatic operations the browser won't do on its own: chip
 * insertion, history recall, submit. (See "reducer 不接管原生编辑" decision.)
 */
export type EditorCommand =
	| { readonly kind: "insert-chip"; readonly inline: Inline }
	| { readonly kind: "replace-from-history"; readonly draft: Draft }
	| { readonly kind: "submit" };

export type ApplyResult =
	| { readonly kind: "draft-updated"; readonly draft: Draft }
	| {
			readonly kind: "submitted";
			readonly value: string;
			readonly nextDraft: Draft;
	  }
	| { readonly kind: "submit-blocked-empty"; readonly draft: Draft };

/**
 * Pure reducer. Exhaustive switch over EditorCommand; adding a variant
 * without handling it is a compile error (assertNever).
 */
export function applyCommand(draft: Draft, command: EditorCommand): ApplyResult {
	switch (command.kind) {
		case "insert-chip":
			return { kind: "draft-updated", draft: insertInline(draft, command.inline) };

		case "replace-from-history":
			return { kind: "draft-updated", draft: command.draft };

		case "submit":
			return submit(draft);

		default:
			return assertNever(command);
	}
}

function insertInline(draft: Draft, inline: Inline): Draft {
	return {
		left: [...draft.left, inline],
		right: draft.right,
	};
}

function submit(draft: Draft): ApplyResult {
	const value = serializeDraft(draft);
	if (value.length === 0) {
		return { kind: "submit-blocked-empty", draft };
	}
	return { kind: "submitted", value, nextDraft: emptyDraft() };
}

// --- Draft <-> canonical string ---

/**
 * Parse a canonical task string (the store's taskDraft) into a Draft with the
 * cursor at the end. Used on session load / external value changes.
 */
export function parseDraft(value: string): Draft {
	const blocks = parseBlocks(value);
	const left: Inline[] = blocks.map(blockToInline).filter(isInline);
	return { left, right: [] };
}

/**
 * Parse a canonical string with the cursor at `offset` (in canonical char
 * space). Used by the bridge layer after reading the live contentEditable:
 * the browser reports a Selection offset, we split the value there.
 *
 * design: offset 可能落在 chip token 内部(虽然打字时不会,但 Selection API
 * 的边界 case 可能报出)。snap 到最近 chip 边界再切,保证 zipper 的 left/right
 * 只在合法的 chip 边界断开——cursor 永远不会"在 chip 里"。
 */
export function parseDraftAtOffset(value: string, offset: number): Draft {
	const blocks = parseBlocks(value);
	const safeOffset = snapToBoundary(blocks, offset);
	const leftStr = value.slice(0, safeOffset);
	const rightStr = value.slice(safeOffset);
	const left = parseBlocks(leftStr).map(blockToInline).filter(isInline);
	const right = parseBlocks(rightStr).map(blockToInline).filter(isInline);
	return { left, right };
}

/**
 * If `offset` falls inside a mention block's raw token, snap it to the
 * nearer edge of that token. Text-block offsets pass through unchanged.
 */
function snapToBoundary(blocks: readonly Block[], offset: number): number {
	let consumed = 0;
	for (const block of blocks) {
		const len = block.type === "text" ? block.text.length : block.raw.length;
		const blockEnd = consumed + len;
		if (offset > consumed && offset < blockEnd) {
			// strictly inside this block
			if (block.type === "mention") {
				// snap to nearer edge
				return offset - consumed <= len / 2 ? consumed : blockEnd;
			}
		}
		consumed = blockEnd;
	}
	return Math.max(0, Math.min(offset, consumed));
}

/**
 * Serialize a Draft back to the canonical string. Concatenates text values
 * and chip raw tokens in order.
 */
export function serializeDraft(draft: Draft): string {
	let out = "";
	for (const inline of draft.left) {
		out += inlineToString(inline);
	}
	for (const inline of draft.right) {
		out += inlineToString(inline);
	}
	return out;
}

function blockToInline(block: Block): Inline | null {
	if (block.type === "text") {
		return block.text.length === 0 ? null : { kind: "text", value: block.text };
	}
	return {
		kind: "chip",
		chipKind: block.kind,
		raw: block.raw,
		label: block.label,
		title: block.title,
	};
}

function isInline(x: Inline | null): x is Inline {
	return x !== null;
}

function inlineToString(inline: Inline): string {
	return inline.kind === "text" ? inline.value : inline.raw;
}

/**
 * Exhaustiveness guard. Throws if a switch misses a variant.
 */
export function assertNever(value: never): never {
	throw new Error(`Unreachable variant: ${JSON.stringify(value)}`);
}
