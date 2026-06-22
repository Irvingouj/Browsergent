import type { FunctionalComponent, Ref } from "preact";
import { useCallback, useEffect, useRef } from "preact/hooks";
import {
	nodePositionToOffset,
	offsetToNodePosition,
	parseBlocks,
	readDomNodes,
	reconstructCanonical,
	type Block,
	type ReconstructNode,
} from "./chip-model";

/**
 * contentEditable input that renders @ mentions and / skills as atomic,
 * non-editable chip spans. Plain text between chips is editable normally;
 * the caret works everywhere; backspace deletes a whole chip.
 *
 * Contract with the store: `value` is the canonical string (tokens inlined).
 * The DOM is the view; on every edit we read it back, rebuild the canonical
 * string, and call `onChange`. We only re-render the DOM from `value` when it
 * diverges from what the DOM currently produces (external updates like history
 * recall, drag-drop, or picker insert) — never while the user is typing, to
 * preserve their caret.
 *
 * Caret offset reporting uses chip-model's offset<->node mapping so consumers
 * (useInputMode) keep operating on (string, offset) exactly like the textarea.
 */

export interface ChipInputProps {
	value: string;
	onChange: (canonical: string, cursorOffset: number) => void;
	onKeyDown: (e: KeyboardEvent) => void;
	onFocus?: () => void;
	onBlur?: () => void;
	onPaste?: (e: ClipboardEvent) => void;
	inputRef?: Ref<HTMLDivElement>;
	placeholder?: string;
	disabled?: boolean;
	class?: string;
	/** Caret offset to restore after the next external value change. */
	caretOffset?: number;
}

function chipClass(kind: "dir" | "file" | "tab" | "skill"): string {
	return [
		"mention-chip",
		"inline-flex",
		"items-center",
		"rounded",
		"border",
		"border-border-strong",
		"bg-bg-muted",
		"px-1",
		"py-0",
		"text-xs",
		"font-medium",
		"text-text-primary",
		"align-middle",
		"leading-none",
		"whitespace-nowrap",
		`mention-chip--${kind}`,
	].join(" ");
}

/** Build the DOM innerHTML for a canonical value. */
function renderBlocks(value: string): string {
	const blocks = parseBlocks(value);
	if (blocks.length === 0) return "";
	const escape = (s: string): string =>
		s
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;");
	let html = "";
	for (const block of blocks) {
		if (block.type === "text") {
			html += escape(block.text);
			continue;
		}
		const titleAttr =
			block.title !== null ? ` title="${escape(block.title)}"` : "";
		// contenteditable=false makes the span atomic: the caret jumps over it
		// and backspace removes it whole. data-raw carries the canonical token
		// so we can reconstruct the string on input.
		html += `<span class="${chipClass(block.kind)}" contenteditable="false" data-raw="${escape(block.raw)}" data-chip-kind="${block.kind}"${titleAttr}>${escape(block.label)}</span>`;
	}
	return html;
}

/** Read (canonical, cursorOffset) from the live contentEditable. */
function readState(root: HTMLElement): { canonical: string; cursor: number } {
	const nodes = readDomNodes(root);
	const canonical = reconstructCanonical(nodes);
	const sel = root.ownerDocument.getSelection();
	let cursor = canonical.length;
	if (sel && sel.rangeCount > 0) {
		const range = sel.getRangeAt(0);
		if (root.contains(range.startContainer)) {
			cursor = cursorFromRange(root, nodes, range);
		}
	}
	return { canonical, cursor };
}

function cursorFromRange(
	root: HTMLElement,
	nodes: ReadonlyArray<ReconstructNode>,
	range: Range,
): number {
	const { startContainer, startOffset } = range;
	let nodeIndex = -1;
	const children = Array.from(root.childNodes);
	for (let i = 0; i < children.length; i++) {
		const child = children[i];
		if (child === undefined) continue;
		if (child === startContainer) {
			nodeIndex = i;
			break;
		}
		// Selection can land inside a chip's text — treat as the chip node.
		if (
			child.nodeType === Node.ELEMENT_NODE &&
			startContainer.nodeType === Node.TEXT_NODE &&
			child.contains(startContainer)
		) {
			nodeIndex = i;
			break;
		}
	}
	if (nodeIndex === -1) {
		return nodes.reduce(
			(sum, n) => sum + (n.raw?.length ?? n.text?.length ?? 0),
			0,
		);
	}
	const node = nodes[nodeIndex];
	if (node && node.raw !== null && node.raw !== undefined) {
		return nodePositionToOffset(nodes, nodeIndex, startOffset > 0 ? 1 : 0);
	}
	return nodePositionToOffset(nodes, nodeIndex, startOffset);
}

/** Place the caret at a canonical-string offset in the contentEditable. */
function setCaret(root: HTMLElement, offset: number): void {
	const nodes = readDomNodes(root);
	const pos = offsetToNodePosition(nodes, offset);
	if (!pos) return;
	const child = root.childNodes[pos.nodeIndex];
	const doc = root.ownerDocument;
	const sel = doc.getSelection();
	if (!sel) return;
	const range = doc.createRange();
	if (!child) {
		range.selectNodeContents(root);
		range.collapse(false);
	} else if (child instanceof Text) {
		const len = child.data.length;
		range.setStart(child, Math.min(pos.offsetInNode, len));
		range.collapse(true);
	} else {
		// element (chip): position before or after
		const el = child as Element;
		const after = pos.offsetInNode >= 1;
		if (after && el.nextSibling) {
			range.setStartBefore(el.nextSibling);
		} else if (after) {
			range.setStartAfter(el);
		} else {
			range.setStartBefore(el);
		}
		range.collapse(true);
	}
	sel.removeAllRanges();
	sel.addRange(range);
}

export const ChipInput: FunctionalComponent<ChipInputProps> = ({
	value,
	onChange,
	onKeyDown,
	onFocus,
	onBlur,
	onPaste,
	inputRef,
	placeholder,
	disabled,
	class: className,
	caretOffset,
}) => {
	const internalRef = useRef<HTMLDivElement | null>(null);
	const setRef = useCallback(
		(node: HTMLDivElement | null): void => {
			internalRef.current = node;
			if (!inputRef) return;
			if (typeof inputRef === "object") {
				inputRef.current = node;
			} else {
				inputRef(node);
			}
		},
		[inputRef],
	);

	// Track whether the last change originated here, so we don't clobber the
	// DOM (and the caret) by echoing back the canonical string we just emitted.
	const selfEdit = useRef(false);

	// Render from value ONLY when it diverges from the live DOM. This covers
	// external updates (history recall, drag-drop, picker insert). When the
	useEffect(() => {
		const el = internalRef.current;
		if (!el) return;
		if (selfEdit.current) {
			selfEdit.current = false;
			return;
		}
		const live = reconstructCanonical(readDomNodes(el));
		if (live !== value) {
			el.innerHTML = renderBlocks(value);
		}
		if (caretOffset !== undefined) {
			setCaret(el, caretOffset);
		}
	}, [value, caretOffset]);

	// Placeholder visibility: the :empty selector needs no child nodes, so we
	// must clear the ZWSP we use to keep height when blank.
	const ensureEmptyHeight = useCallback((el: HTMLDivElement): void => {
		if (el.childNodes.length === 0) {
			el.textContent = "\u200B";
		}
	}, []);

	const handleInput = useCallback(
		(e: Event) => {
			const el = e.currentTarget as HTMLDivElement;
			// Strip the ZWSP placeholder if real text arrived.
			if (
				el.childNodes.length === 1 &&
				el.firstChild?.nodeType === Node.TEXT_NODE &&
				el.firstChild.textContent === "\u200B"
			) {
				el.textContent = "";
			}
			const { canonical, cursor } = readState(el);
			selfEdit.current = true;
			onChange(canonical, cursor);
			ensureEmptyHeight(el);
		},
		[onChange, ensureEmptyHeight],
	);

	// onKeyDown forwards directly to the consumer (useInputMode) which owns all
	// key interpretation. No wrapper needed.

	// Paste as plain text only — never rich HTML — so chip spans from elsewhere
	// can't corrupt the model.
	const handlePaste = useCallback(
		(e: ClipboardEvent) => {
			if (onPaste) {
				onPaste(e);
				if (e.defaultPrevented) return;
			}
			e.preventDefault();
			const text = e.clipboardData?.getData("text/plain") ?? "";
			const doc = internalRef.current?.ownerDocument ?? document;
			doc.execCommand("insertText", false, text);
		},
		[onPaste],
	);

	const handleFocus = useCallback(() => {
		onFocus?.();
	}, [onFocus]);

	const handleBlur = useCallback(() => {
		const el = internalRef.current;
		if (el) ensureEmptyHeight(el);
		onBlur?.();
	}, [onBlur, ensureEmptyHeight]);

	const isEmpty = parseBlocks(value).every((b: Block) => b.type === "text" && b.text === "");

	return (
		<div class="relative">
			<div
				ref={setRef}
				contentEditable={!disabled}
				data-testid="task-input"
				role="textbox"
				aria-multiline="true"
				aria-label={placeholder ?? "Task input"}
				data-placeholder={isEmpty ? (placeholder ?? "") : undefined}
				onInput={handleInput}
				onKeyDown={onKeyDown}
				onFocus={handleFocus}
				onBlur={handleBlur}
				onPaste={handlePaste}
				class={[
					className ?? "",
					"task-input-chip",
					"whitespace-pre-wrap",
					"break-words",
					"overflow-y-auto",
					isEmpty ? "task-input-chip--empty" : "",
				].join(" ")}
			/>
		</div>
	);
};
