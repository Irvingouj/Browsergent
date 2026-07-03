import { escapeHtml } from "./syntax-highlight";

/**
 * URL pattern for http(s) links. Matches the scheme + non-whitespace run.
 * Trailing punctuation is trimmed so a link at end of a sentence
 * ("See https://x.com.") doesn't swallow the period.
 */
const URL_RE = /https?:\/\/[^\s<>"')\]]+/g;
/**
 * Escape HTML and turn http(s) URLs into clickable `<a>` links with class
 * `linkify`. Safe to inject via dangerouslySetInnerHTML — every non-link
 * char is escaped and the URL is escaped in both href and text.
 */
export function linkify(text: string): string {
	const out: string[] = [];
	let last = 0;
	// Fresh regex per call so lastIndex can't leak between invocations.
	const re = new RegExp(URL_RE.source, "g");
	let m: RegExpExecArray | null;
	while ((m = re.exec(text)) !== null) {
		const start = m.index;
		const raw = m[0];
		const trimmed = raw.replace(/[.,;:!?)]+$/, "");
		if (start > last) {
			out.push(escapeHtml(text.slice(last, start)));
		}
		out.push(
			`<a href="${escapeHtml(trimmed)}" class="linkify" target="_blank" rel="noopener noreferrer">${escapeHtml(trimmed)}</a>`,
		);
		last = start + trimmed.length;
		// Skip the trailing punctuation we trimmed so it stays as text.
		const consumed = raw.length - trimmed.length;
		if (consumed > 0) re.lastIndex += consumed;
	}
	if (last < text.length) {
		out.push(escapeHtml(text.slice(last)));
	}
	return out.join("");
}

/** Does the string contain at least one http(s) URL? */
export function hasUrl(text: string): boolean {
	return new RegExp(URL_RE.source).test(text);
}