import {
	type MentionSegment,
	tokenizeMentions,
} from "../../../utils/markdown-stream";

/**
 * Canonical input model. The store holds `taskDraft` as a plain string with
 * inline `@[file:id:name]` / `@[tab:id:title]` / `/skill:name` tokens (so
 * history, persistence, and model-facing resolution all keep working).
 *
 * The contentEditable ChipInput is purely a view over that string: it parses
 * blocks, renders chips as atomic DOM nodes, and reconstructs the canonical
 * string on every edit. These helpers own that conversion plus the cursor
 * offset <-> DOM position mapping that lets `useInputMode` keep operating on
 * (string, offset) like it did with the textarea.
 */

export type Block =
	| { type: "text"; text: string }
	| {
			type: "mention";
			kind: "dir" | "file" | "tab" | "skill";
			raw: string;
			label: string;
			title: string | null;
	  };

function basename(path: string): string {
	return path.split("/").pop() ?? path;
}

function truncate(text: string, max = 20): string {
	return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** Parse a canonical task string into ordered text/mention blocks. */
export function parseBlocks(text: string): Block[] {
	const segments = tokenizeMentions(text);
	return segments.map((seg: MentionSegment): Block => {
		if (seg.type === "text") return { type: "text", text: seg.text };
		if (seg.type === "dir") {
			return {
				type: "mention",
				kind: "dir",
				raw: seg.raw,
				label: `${basename(seg.name)}/`,
				title: seg.path,
			};
		}
		if (seg.type === "file") {
			return {
				type: "mention",
				kind: "file",
				raw: seg.raw,
				label: basename(seg.name),
				title: seg.name,
			};
		}
		if (seg.type === "tab") {
			return {
				type: "mention",
				kind: "tab",
				raw: seg.raw,
				label: truncate(seg.title),
				title: seg.title,
			};
		}
		return {
			type: "mention",
			kind: "skill",
			raw: seg.raw,
			label: `/${seg.skillName}`,
			title: null,
		};
	});
}

/**
 * Reconstruct the canonical string from a flat list of rendered nodes.
 * Each chip carries its original token in `data-raw`; text in between is the
 * node's textContent. This is the inverse of parseBlocks for editing purposes
 * (the user can freely edit the text parts; chips are atomic).
 */
export interface ReconstructNode {
	/** text node content, or null if this is a chip node */
	text: string | null;
	/** chip's canonical token (data-raw), or null if this is a text node */
	raw: string | null;
}

export type ReadInputResult =
	| { ok: true; value: string; offset: number }
	| {
			ok: false;
			code: "E_SELECTION_OUTSIDE";
			message: string;
	  };

export function reconstructCanonical(
	nodes: ReadonlyArray<ReconstructNode>,
): string {
	let out = "";
	for (const n of nodes) {
		out += n.raw ?? n.text ?? "";
	}
	return out;
}

/**
 * Map a canonical-string character offset to a (nodeIndex, offsetInNode)
 * position over the same flat node list used by reconstructCanonical.
 *
 * For text nodes, offsetInNode is a character offset into the text.
 * For chip nodes, offsetInNode is 0 (before) or 1 (after) — chips are atomic,
 * so a target that lands inside a chip snaps to its nearest edge.
 *
 * Returns null if the offset is out of range.
 */
export function offsetToNodePosition(
	nodes: ReadonlyArray<ReconstructNode>,
	target: number,
): { nodeIndex: number; offsetInNode: number } | null {
	let consumed = 0;
	for (let i = 0; i < nodes.length; i++) {
		const node = nodes[i];
		const len = node?.raw?.length ?? node?.text?.length ?? 0;
		const nodeEnd = consumed + len;
		if (target <= nodeEnd) {
			if (node?.raw !== undefined && node.raw !== null) {
				// chip: snap to nearest edge
				const localOffset = target - consumed;
				return { nodeIndex: i, offsetInNode: localOffset <= len / 2 ? 0 : 1 };
			}
			return { nodeIndex: i, offsetInNode: target - consumed };
		}
		consumed = nodeEnd;
	}
	// past the end → end of last node
	if (nodes.length === 0) return null;
	const last = nodes[nodes.length - 1];
	const lastLen = last?.raw?.length ?? last?.text?.length ?? 0;
	return { nodeIndex: nodes.length - 1, offsetInNode: lastLen };
}

/**
 * Inverse of offsetToNodePosition: map a (nodeIndex, offsetInNode) position
 * back to a canonical-string character offset. Used to report the caret
 * position to useInputMode after each edit.
 */
export function nodePositionToOffset(
	nodes: ReadonlyArray<ReconstructNode>,
	nodeIndex: number,
	offsetInNode: number,
): number {
	let offset = 0;
	for (let i = 0; i < nodes.length; i++) {
		const node = nodes[i];
		const len = node?.raw?.length ?? node?.text?.length ?? 0;
		if (i === nodeIndex) {
			return offset + Math.min(Math.max(offsetInNode, 0), len);
		}
		offset += len;
	}
	return offset;
}

/**
 * Read the flat node list from a contentEditable element in DOM order.
 * Text nodes become {text, raw:null}; chip spans become {text:null, raw}.
 */
const blockTags = new Set([
	"ADDRESS",
	"ARTICLE",
	"ASIDE",
	"BLOCKQUOTE",
	"DD",
	"DIV",
	"DL",
	"DT",
	"FIELDSET",
	"FIGCAPTION",
	"FIGURE",
	"FOOTER",
	"FORM",
	"H1",
	"H2",
	"H3",
	"H4",
	"H5",
	"H6",
	"HEADER",
	"HR",
	"LI",
	"MAIN",
	"NAV",
	"OL",
	"P",
	"PRE",
	"SECTION",
	"TABLE",
	"UL",
]);

function appendText(nodes: ReconstructNode[], text: string): void {
	if (text.length === 0) return;
	const last = nodes[nodes.length - 1];
	if (last?.raw === null) {
		nodes[nodes.length - 1] = { text: `${last.text ?? ""}${text}`, raw: null };
		return;
	}
	nodes.push({ text, raw: null });
}

function appendNewline(nodes: ReconstructNode[]): void {
	const last = nodes[nodes.length - 1];
	if (last?.raw === null && last.text?.endsWith("\n")) return;
	appendText(nodes, "\n");
}

export function readDomNodes(root: ParentNode): ReconstructNode[] {
	const nodes: ReconstructNode[] = [];
	const walk = (parent: ParentNode): void => {
		parent.childNodes.forEach((child) => {
			if (child.nodeType === Node.TEXT_NODE) {
				appendText(nodes, child.textContent ?? "");
				return;
			}
			if (child.nodeType !== Node.ELEMENT_NODE) return;
			const el = child as HTMLElement;
			if (el.dataset.raw !== undefined) {
				nodes.push({ text: null, raw: el.dataset.raw ?? "" });
				return;
			}
			if (el.tagName === "BR") {
				appendNewline(nodes);
				return;
			}
			if (blockTags.has(el.tagName) && nodes.length > 0) appendNewline(nodes);
			walk(el);
		});
	};
	walk(root);
	return nodes;
}

export function readContentEditable(root: HTMLElement): ReadInputResult {
	const nodes = readDomNodes(root);
	const value = reconstructCanonical(nodes);
	const sel = root.ownerDocument.getSelection();
	if (!sel || sel.rangeCount === 0)
		return { ok: true, value, offset: value.length };

	const range = sel.getRangeAt(0);
	if (!root.contains(range.startContainer)) {
		return {
			ok: false,
			code: "E_SELECTION_OUTSIDE",
			message: "Selection is outside the task input.",
		};
	}

	const beforeCaret = range.cloneRange();
	beforeCaret.selectNodeContents(root);
	beforeCaret.setEnd(range.startContainer, range.startOffset);
	const fragmentRoot = root.ownerDocument.createElement("div");
	fragmentRoot.appendChild(beforeCaret.cloneContents());
	return {
		ok: true,
		value,
		offset: reconstructCanonical(readDomNodes(fragmentRoot)).length,
	};
}
