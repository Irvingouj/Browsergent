import { marked } from "marked";

function postProcessHtml(html: string): string {
	return html
		.replace(
			/<pre>/g,
			'<pre style="background:#0a0d12;padding:10px;border-radius:6px;overflow:auto;font-size:11px;line-height:1.5;margin:6px 0;border:1px solid rgba(255,255,255,0.06);font-family:JetBrains Mono,monospace;">',
		)
		.replace(
			/<code>/g,
			'<code style="background:#0a0d12;padding:1px 5px;border-radius:4px;font-size:11px;color:#22d3ee;font-family:JetBrains Mono,monospace;border:1px solid rgba(255,255,255,0.06);">',
		)
		.replace(
			/<ul>/g,
			'<ul style="margin:6px 0;padding-left:18px;color:#94a3b8;">',
		)
		.replace(
			/<ol>/g,
			'<ol style="margin:6px 0;padding-left:18px;color:#94a3b8;">',
		)
		.replace(
			/<a /g,
			'<a style="color:#22d3ee;text-decoration:none;border-bottom:1px solid transparent;transition:border-color 0.2s;" ',
		)
		.replace(/<p>/g, '<p style="margin:0 0 6px 0;color:#e2e8f0;">');
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
