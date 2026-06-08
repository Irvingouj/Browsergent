import { marked, type Parser, type Renderer } from "marked";
import { formatLangLabel, highlightCode } from "./syntax-highlight";

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

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

export function renderMarkdown(text: string): string {
	return safeParseMarkdown(text);
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
