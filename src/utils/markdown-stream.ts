import { marked } from "marked";

function postProcessHtml(html: string): string {
	return html
		.replace(
			/<pre>/g,
			'<pre style="background:#f0f0f0;padding:8px;border-radius:4px;overflow:auto;font-size:12px;line-height:1.4;margin:4px 0;">',
		)
		.replace(
			/<code>/g,
			'<code style="background:#f0f0f0;padding:1px 4px;border-radius:3px;font-size:12px;">',
		)
		.replace(/<ul>/g, '<ul style="margin:4px 0;padding-left:16px;">')
		.replace(/<ol>/g, '<ol style="margin:4px 0;padding-left:16px;">')
		.replace(/<a /g, '<a style="color:#4a90d9;text-decoration:underline;" ')
		.replace(/<p>/g, '<p style="margin:0 0 4px 0;">');
}

export function renderMarkdown(text: string): string {
	const safe = text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
	const html = marked.parse(safe, { async: false }) as string;
	return postProcessHtml(html);
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
				const blockHtml = postProcessHtml(
					marked.parse(token.raw, { async: false }) as string,
				);

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
