import { tokenizeMentions, type MentionSegment } from "../../../utils/markdown-stream";

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

export function reconstructCanonical(nodes: ReadonlyArray<ReconstructNode>): string {
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
export function readDomNodes(root: HTMLElement): ReconstructNode[] {
	const nodes: ReconstructNode[] = [];
	root.childNodes.forEach((child) => {
		if (child.nodeType === Node.TEXT_NODE) {
			nodes.push({ text: child.textContent ?? "", raw: null });
			return;
		}
		if (child.nodeType === Node.ELEMENT_NODE) {
			const el = child as HTMLElement;
			if (el.dataset.raw !== undefined) {
				nodes.push({ text: null, raw: el.dataset.raw ?? "" });
			} else if (el.tagName === "BR") {
				nodes.push({ text: "\n", raw: null });
			} else {
				// fallback: treat unknown element as its text content
				nodes.push({ text: el.textContent ?? "", raw: null });
			}
		}
	});
	return nodes;
}
