import type { FunctionalComponent, Ref } from "preact";
import { useCallback, useEffect, useRef } from "preact/hooks";
import {
	nodePositionToOffset,
	offsetToNodePosition,
	parseBlocks,
	type ReconstructNode,
	readDomNodes,
	reconstructCanonical,
} from "./chip-model";
import type { Draft, Inline } from "./draft-model";

/**
 * contentEditable view over a `Draft`. Two data flows meet here:
 *
 * A. Typing (browser-led): the browser edits the DOM; on each `input` event we
 *    read the canonical value + caret offset and call `onRead` so the parent
 *    can rebuild the Draft. We NEVER write the DOM back on this path — the
 *    browser just wrote it, it's correct, rewriting races the next keystroke.
 *
 * B. Programmatic (reducer-led): when the parent applies an EditorCommand
 *    (insert-chip, history, submit-clear), it sets `domSync` to `reconcile`.
 *    The effect below rewrites the DOM from the Draft and restores the caret.
 *    After reconciling, `domSync` returns to `idle`.
 *
 * design: "should I rewrite the DOM?" is encoded as a tagged `DomSync` state,
 * not a boolean flag or a counter. idle/reconcile are the only two states;
 * invalid mixes (rewrite without reconcile, reconcile without rewrite) are
 * unrepresentable. This is what kills the caret-racing bug at the root.
 */

export type DomSync =
	| { readonly kind: "idle" }
	| { readonly kind: "reconcile"; readonly draft: Draft };

export interface ChipInputProps {
	/** The Draft the parent believes is current. Used for placeholder check. */
	draft: Draft;
	/** When !== "idle", rewrite DOM from draft.draft and restore caret. */
	domSync: DomSync;
	/** Typing path: parent rebuilds Draft from (value, offset) we report. */
	onRead: (value: string, offset: number) => void;
	onKeyDown: (e: KeyboardEvent) => void;
	onFocus?: () => void;
	onBlur?: () => void;
	onPaste?: (e: ClipboardEvent) => void;
	inputRef?: Ref<HTMLDivElement>;
	placeholder?: string;
	disabled?: boolean;
	class?: string;
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

function htmlEscape(s: string): string {
	return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Build the DOM innerHTML for a canonical value. */
function renderBlocks(value: string): string {
	const blocks = parseBlocks(value);
	if (blocks.length === 0) return "";
	let html = "";
	for (const block of blocks) {
		if (block.type === "text") {
			html += htmlEscape(block.text);
			continue;
		}
		const titleAttr =
			block.title !== null ? ` title="${htmlEscape(block.title)}"` : "";
		html += `<span class="${chipClass(block.kind)}" contenteditable="false" data-raw="${htmlEscape(block.raw)}" data-chip-kind="${block.kind}"${titleAttr}>${htmlEscape(block.label)}</span>`;
	}
	return html;
}

function serializeDraft(draft: Draft): string {
	let out = "";
	const emit = (inline: Inline): void => {
		out += inline.kind === "text" ? inline.value : inline.raw;
	};
	draft.left.forEach(emit);
	draft.right.forEach(emit);
	return out;
}

/** Canonical offset of the caret (cursor sits in the zipper gap). */
function caretOffset(draft: Draft): number {
	let n = 0;
	for (const inline of draft.left) {
		n += inline.kind === "text" ? inline.value.length : inline.raw.length;
	}
	return n;
}

/** Read the canonical caret offset from the live contentEditable. */
function readSelectionOffset(root: HTMLElement): number {
	const nodes = readDomNodes(root);
	const sel = root.ownerDocument.getSelection();
	if (!sel || sel.rangeCount === 0) {
		return reconstructCanonical(nodes).length;
	}
	const range = sel.getRangeAt(0);
	if (!root.contains(range.startContainer)) {
		return reconstructCanonical(nodes).length;
	}
	return cursorFromRange(root, nodes, range);
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
	draft,
	domSync,
	onRead,
	onKeyDown,
	onFocus,
	onBlur,
	onPaste,
	inputRef,
	placeholder,
	disabled,
	class: className,
}) => {
	const internalRef = useRef<HTMLDivElement | null>(null);
	// design: IME 组合期间绝不读 DOM/写 model。组合中的拼音是 transient DOM 文本,
	// 此时读回会得到未 commit 的内容,造成抖动。compositionend 后一次性读。
	const isComposing = useRef(false);

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

	// design: 只在 domSync === reconcile 时重写 DOM + 落光标(B 路径)。
	// 打字(A 路径)更新 draft 但 domSync 停在 idle,所以此 effect 不跑,
	// 不和浏览器的下一键竞态。idle/reconcile 是显式的 tagged state,
	// 不是 boolean flag——"重写但不 reconcile"或反之是 unrepresentable 的。
	useEffect(() => {
		if (domSync.kind !== "reconcile") return;
		const el = internalRef.current;
		if (!el) return;
		const value = serializeDraft(domSync.draft);
		el.innerHTML = renderBlocks(value);
		setCaret(el, caretOffset(domSync.draft));
	}, [domSync]);

	const handleInput = useCallback(
		(e: Event) => {
			if (isComposing.current) return;
			const el = e.currentTarget as HTMLDivElement;
			// After deleting all text, the browser leaves a <br>. Clear it so the
			// element is truly empty (matches canonical "" and shows placeholder).
			if (
				el.textContent === "" ||
				(el.childNodes.length === 1 && el.firstChild?.nodeName === "BR")
			) {
				el.innerHTML = "";
			}
			// design: A 路径——只读 DOM 报告给 parent,绝不写回。浏览器是打字期间
			// 唯一的 DOM 写者;我们读一次 (value, offset),让 parent 重建 Draft。
			const value = reconstructCanonical(readDomNodes(el));
			const offset = readSelectionOffset(el);
			onRead(value, offset);
		},
		[onRead],
	);

	const handleCompositionStart = useCallback((): void => {
		isComposing.current = true;
	}, []);

	const handleCompositionEnd = useCallback(
		(e: CompositionEvent): void => {
			isComposing.current = false;
			handleInput(e);
		},
		[handleInput],
	);

	const handlePaste = useCallback(
		(e: ClipboardEvent): void => {
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

	const handleFocus = useCallback((): void => {
		onFocus?.();
	}, [onFocus]);

	const handleBlur = useCallback((): void => {
		onBlur?.();
	}, [onBlur]);

	const isEmpty = draft.left.length === 0 && draft.right.length === 0;

	return (
		<div class="relative">
			{isEmpty && !disabled && placeholder && (
				<div class="absolute inset-0 px-md py-sm text-sm text-text-dim pointer-events-none whitespace-pre-wrap truncate">
					{placeholder}
				</div>
			)}
			<div
				ref={setRef}
				contentEditable={!disabled}
				data-testid="task-input"
				role="textbox"
				aria-multiline="true"
				aria-label={placeholder ?? "Task input"}
				onInput={handleInput}
				onKeyDown={onKeyDown}
				onFocus={handleFocus}
				onBlur={handleBlur}
				onPaste={handlePaste}
				onCompositionStart={handleCompositionStart}
				onCompositionEnd={handleCompositionEnd}
				class={[
					className ?? "",
					"task-input-chip",
					"whitespace-pre-wrap",
					"break-words",
					"overflow-y-auto",
				].join(" ")}
			/>
		</div>
	);
};
