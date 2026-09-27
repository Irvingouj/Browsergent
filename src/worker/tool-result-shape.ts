/**
 * Shorten a tool result before pi-core stores it.
 * The kept text is a head and a tail. The full string is written beside it.
 */

export function recordCapChars(maxContextTokens: number): number {
	const raw = Math.floor(maxContextTokens * 0.06 * 3);
	return Math.min(48_000, Math.max(16_000, raw));
}

export function shapeToolResultText(
	text: string,
	cap: number,
	artifactPath: string,
): { forCore: string; truncated: boolean } {
	if (cap <= 0 || text.length <= cap) {
		return { forCore: text, truncated: false };
	}
	const headLen = Math.floor(cap * 0.7);
	const tailLen = cap - headLen;
	const omitted = text.length - headLen - tailLen;
	const marker = [
		"",
		`[... ${omitted.toLocaleString("en-US")} characters omitted (${text.length.toLocaleString("en-US")} total). Full output saved to ${artifactPath} — use file_read with offset/limit, or re-run with a narrower selector/extraction ...]`,
		"",
	].join("\n");
	return {
		forCore:
			text.slice(0, headLen) + marker + text.slice(text.length - tailLen),
		truncated: true,
	};
}

export function artifactPathFor(id: string): string {
	const safe = id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32);
	return `/artifacts/tc_${safe || "result"}.txt`;
}
