import { marked } from "marked";
import { formatLangLabel, highlightCode } from "./syntax-highlight";

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

const renderer = new marked.Renderer();

renderer.code = ({ text, lang }): string => {
	const language = lang || "";
	const highlighted = language
		? highlightCode(text, language)
		: escapeHtml(text);
	const label = language ? formatLangLabel(language) : "";
	return `<pre class="${language ? `language-${language} ` : ""}code-block"><div class="code-block__header">${label ? `<span class="code-block__lang">${label}</span>` : ""}</div><code class="${language ? `language-${language}` : ""}">${highlighted}</code></pre>`;
};

renderer.codespan = ({ text }): string => {
	return `<code class="inline-code">${escapeHtml(text)}</code>`;
};

renderer.blockquote = ({ tokens }): string => {
	const html = marked.parser(tokens as never);
	return `<blockquote class="msg-blockquote">${html}</blockquote>`;
};

renderer.table = ({ header, rows }): string => {
	const buildRow = (cells: unknown, cellTag: string) => {
		const html = (cells as Array<{ text: string; tokens: never[] }>)
			.map(
				(c) =>
					`<${cellTag} class="msg-table-cell">${marked.parser(c.tokens)}</${cellTag}>`,
			)
			.join("");
		return `<tr class="msg-table-row">${html}</tr>`;
	};
	return `<table class="msg-table"><thead>${buildRow(header, "th")}</thead><tbody>${rows.map((r) => buildRow(r, "td")).join("")}</tbody></table>`;
};

renderer.list = ({ items, ordered }): string => {
	const tag = ordered ? "ol" : "ul";
	const html = items
		.map((item) => {
			const itemHtml = marked.parser(item.tokens as never);
			const checked =
				item.task && item.checked !== undefined
					? `<input type="checkbox" ${item.checked ? 'checked=""' : ""} disabled="" class="msg-checkbox" /> `
					: "";
			return `<li class="msg-list-item">${checked}${itemHtml}</li>`;
		})
		.join("");
	return `<${tag} class="msg-list">${html}</${tag}>`;
};

renderer.paragraph = ({ tokens }): string => {
	const html = marked.parser(tokens as never);
	return `<p class="msg-paragraph">${html}</p>`;
};

renderer.heading = ({ tokens, depth }): string => {
	const html = marked.parser(tokens as never);
	return `<h${depth} class="msg-heading msg-heading--${depth}">${html}</h${depth}>`;
};

renderer.link = ({ href, tokens }): string => {
	const html = marked.parser(tokens as never);
	return `<a href="${href}" class="msg-link" target="_blank" rel="noopener noreferrer">${html}</a>`;
};

marked.use({ renderer });

export function renderMarkdown(text: string): string {
	const safe = text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
	const html = marked.parse(safe, { async: false }) as string;
	return html;
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

		const tokens = marked.lexer(safe, { async: false });

		let html = "";
		let i = 0;
		for (const token of tokens) {
			const key = token.raw.slice(0, 64);

			if (i < completedBlocks.length && completedBlocks[i]?.key === key) {
				html += completedBlocks[i]?.html;
			} else {
				const blockHtml = marked.parse(token.raw, {
					async: false,
				}) as string;

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
