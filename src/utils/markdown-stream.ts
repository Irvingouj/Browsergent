import { marked, type Parser, type Renderer } from "marked";
import { formatLangLabel, highlightCode } from "./syntax-highlight";

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

// --- Token chip types / regexes ---

export type MentionSegment =
	| { type: "text"; text: string }
	| { type: "dir"; path: string; name: string; raw: string }
	| { type: "file"; fileId: string; name: string; raw: string }
	| { type: "tab"; tabId: string; title: string; raw: string }
	| { type: "skill"; skillName: string; raw: string };

function buildDirChip(path: string, name: string): string {
	return `<span class="mention-chip inline-flex items-center gap-1 rounded border border-border-strong bg-bg-muted px-1.5 py-0.5 text-xs font-medium text-text-primary align-middle" title="${escapeHtml(path)}" data-chip-kind="dir">${escapeHtml(name)}/</span>`;
}

function buildFileChip(_fileId: string, name: string): string {
	const basename = name.split("/").pop() ?? name;
	return `<span class="mention-chip inline-flex items-center gap-1 rounded border border-border-strong bg-bg-muted px-1.5 py-0.5 text-xs font-medium text-text-primary align-middle" title="${escapeHtml(name)}" data-chip-kind="file">${escapeHtml(basename)}</span>`;
}

function buildTabChip(_tabId: string, title: string): string {
	const label = title.length > 20 ? `${title.slice(0, 20)}…` : title;
	return `<span class="mention-chip inline-flex items-center gap-1 rounded border border-border-strong bg-bg-muted px-1.5 py-0.5 text-xs font-medium text-text-primary align-middle" title="${escapeHtml(title)}" data-chip-kind="tab">${escapeHtml(label)}</span>`;
}

function buildSkillChip(skillName: string): string {
	return `<span class="mention-chip inline-flex items-center gap-1 rounded border border-border-strong bg-bg-muted px-1.5 py-0.5 text-xs font-medium text-text-primary align-middle" data-chip-kind="skill">/<wbr>${escapeHtml(skillName)}</span>`;
}

/**
 * Splits raw user text into token segments, preserving the original tokens
 * as typed. Returns a mix of text and mention segments.
 */
export function tokenizeMentions(text: string): MentionSegment[] {
	const TOKEN_RE =
		/@\[dir:([^:\]]+):([^:\]]+)\]|@\[file:([^:\]]+):([^:\]]+)\]|@\[tab:(\d+):([^\]]+)\]|\/skill:([a-z0-9-]+)/g;
	const segments: MentionSegment[] = [];
	let lastIndex = 0;

	for (const m of text.matchAll(TOKEN_RE)) {
		if (m.index === undefined) continue;

		// Emit text segment before this match
		if (m.index > lastIndex) {
			segments.push({ type: "text", text: text.slice(lastIndex, m.index) });
		}

		const raw = m[0] ?? "";
		if (m[1] !== undefined && m[2] !== undefined) {
			// directory reference
			segments.push({
				type: "dir",
				path: m[1],
				name: m[2],
				raw,
			});
		} else if (m[3] !== undefined && m[4] !== undefined) {
			// file mention
			segments.push({
				type: "file",
				fileId: m[3],
				name: m[4],
				raw,
			});
		} else if (m[5] !== undefined && m[6] !== undefined) {
			// tab mention
			segments.push({
				type: "tab",
				tabId: m[5],
				title: m[6],
				raw,
			});
		} else if (m[7] !== undefined) {
			// skill token
			segments.push({
				type: "skill",
				skillName: m[7],
				raw,
			});
		} else {
			// shouldn't happen, but treat as plain text
			segments.push({ type: "text", text: raw });
		}

		lastIndex = m.index + raw.length;
	}

	// Trailing text
	if (lastIndex < text.length) {
		segments.push({ type: "text", text: text.slice(lastIndex) });
	}

	return segments;
}

// --- marked renderer ---

type RendererWithParser = Renderer & { parser: Parser };

const renderer: Partial<Renderer> = {
	code({ text, lang }): string {
		const language = lang || "";
		const highlighted = language
			? highlightCode(text, language)
			: escapeHtml(text);
		const label = language ? formatLangLabel(language) : "";
		return `<pre class="${language ? `language-${language} ` : ""}code-block"><div class="code-block__header">${label ? `<span class="code-block__lang">${label}</span>` : ""}</div><code class="${language ? `language-${language}` : ""}">${highlighted}</code></pre>`;
	},

	codespan({ text }): string {
		return `<code class="inline-code">${escapeHtml(text)}</code>`;
	},

	blockquote(this: RendererWithParser, { tokens }): string {
		const html = this.parser.parse(tokens);
		return `<blockquote class="msg-blockquote">${html}</blockquote>`;
	},

	table(this: RendererWithParser, { header, rows }): string {
		const buildRow = (
			cells: Array<{
				text: string;
				tokens: Parameters<Parser["parseInline"]>[0];
			}>,
			cellTag: string,
		) => {
			const html = cells
				.map(
					(c) =>
						`<${cellTag} class="msg-table-cell">${this.parser.parseInline(c.tokens)}</${cellTag}>`,
				)
				.join("");
			return `<tr class="msg-table-row">${html}</tr>`;
		};
		return `<table class="msg-table"><thead>${buildRow(header, "th")}</thead><tbody>${rows.map((r) => buildRow(r, "td")).join("")}</tbody></table>`;
	},

	list(this: RendererWithParser, { items, ordered }): string {
		const tag = ordered ? "ol" : "ul";
		const html = items
			.map((item) => {
				const itemHtml = this.parser.parse(item.tokens);
				const checked =
					item.task && item.checked !== undefined
						? `<input type="checkbox" ${item.checked ? 'checked=""' : ""} disabled="" class="msg-checkbox" /> `
						: "";
				return `<li class="msg-list-item">${checked}${itemHtml}</li>`;
			})
			.join("");
		return `<${tag} class="msg-list">${html}</${tag}>`;
	},

	paragraph(this: RendererWithParser, { tokens }): string {
		const html = this.parser.parseInline(tokens);
		return `<p class="msg-paragraph">${html}</p>`;
	},

	heading(this: RendererWithParser, { tokens, depth }): string {
		const html = this.parser.parseInline(tokens);
		return `<h${depth} class="msg-heading msg-heading--${depth}">${html}</h${depth}>`;
	},

	link(this: RendererWithParser, { href, tokens }): string {
		const html = this.parser.parseInline(tokens);
		return `<a href="${href}" class="msg-link" target="_blank" rel="noopener noreferrer">${html}</a>`;
	},
};

marked.use({ renderer });

function segmentToChipHtml(seg: MentionSegment): string {
	switch (seg.type) {
		case "dir":
			return buildDirChip(seg.path, seg.name);
		case "file":
			return buildFileChip(seg.fileId, seg.name);
		case "tab":
			return buildTabChip(seg.tabId, seg.title);
		case "skill":
			return buildSkillChip(seg.skillName);
		default:
			return seg.text;
	}
}

function safeParseMarkdown(text: string): string {
	try {
		const safe = text
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;");
		return marked.parse(safe, { async: false }) as string;
	} catch {
		return `<pre class="msg-fallback">${escapeHtml(text)}</pre>`;
	}
}

/**
 * Render markdown with @[file:...], @[tab:...], and /skill:... tokens
 * displayed as inline styled chips.
 */
export function renderMarkdown(text: string): string {
	const segments = tokenizeMentions(text);

	// Fast path: no tokens → plain markdown
	if (segments.length === 1 && segments[0]?.type === "text") {
		return safeParseMarkdown(segments[0].text);
	}

	// Replace each token with a placeholder that survives escaping and
	// markdown parsing, then swap placeholders for chip HTML in the output.
	const chipHtmlByIndex: string[] = [];
	let source = "";
	for (const seg of segments) {
		if (seg.type === "text") {
			source += seg.text;
		} else {
			const idx = chipHtmlByIndex.length;
			// Placeholder: alphanumeric, no & < > — survives escaping
			source += `MC${idx}PLACEHOLDER`;
			chipHtmlByIndex.push(segmentToChipHtml(seg));
		}
	}

	let parsed = safeParseMarkdown(source);
	for (let i = 0; i < chipHtmlByIndex.length; i++) {
		parsed = parsed.replace(`MC${i}PLACEHOLDER`, chipHtmlByIndex[i] ?? "");
	}
	return parsed;
}

export function createStreamingMarkdownRenderer() {
	let completedBlocks: Array<{ key: string; html: string }> = [];
	let lastLength = 0;

	return function renderStreamingMarkdown(text: string): string {
		if (text.length < lastLength) {
			completedBlocks = [];
			lastLength = 0;
		}

		const safe = text
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;");

		let tokens: ReturnType<typeof marked.lexer>;
		try {
			tokens = marked.lexer(safe, { async: false });
		} catch {
			return `<pre class="msg-fallback">${escapeHtml(text)}</pre>`;
		}

		let html = "";
		let i = 0;
		for (const token of tokens) {
			const key = token.raw.slice(0, 64);

			if (i < completedBlocks.length && completedBlocks[i]?.key === key) {
				html += completedBlocks[i]?.html;
			} else {
				let blockHtml: string;
				try {
					blockHtml = marked.parse(token.raw, { async: false }) as string;
				} catch {
					blockHtml = `<pre class="msg-fallback">${escapeHtml(token.raw)}</pre>`;
				}

				if (i < tokens.length - 1) {
					if (i < completedBlocks.length) {
						completedBlocks[i] = { key, html: blockHtml };
					} else {
						completedBlocks.push({ key, html: blockHtml });
					}
				}

				html += blockHtml;
			}
			i++;
		}

		completedBlocks = completedBlocks.slice(0, Math.max(0, tokens.length - 1));
		lastLength = text.length;
		return html;
	};
}
