export interface ToolErrorEnvelope {
	_is_error: true;
	code: string;
	message: string;
	hint: string;
	stack?: string;
	details?: Record<string, unknown>;
}

/**
 * QuickJS's wasm32 backtrace is intentionally disabled (its stack capture
 * crashes the runtime), so engine-thrown errors carry a 5-char garbage stack
 * (`\u00%x\u00%x\u00%x)\n`). Detect "useful" stacks via the presence of a frame
 * marker (`at fn (loc)`) or `file:line:col` so we don't leak the garbage into
 * the agent's view.
 */
export function isStackUseful(stack: unknown): stack is string {
	if (typeof stack !== "string") return false;
	return /\bat\b.+\(.+\)|\b[\w.-]+:\d+:\d+/.test(stack);
}

// Tools return envelopes instead of throwing because the SDK hardcodes is_error: false on tool results.
// The conversion layer (sdk-message-conversion.ts) detects these envelopes and sets is_error: true.
export function formatToolError(
	code: string,
	message: string,
	hint: string,
	stack?: string,
	details?: Record<string, unknown>,
): string {
	const envelope: ToolErrorEnvelope = { _is_error: true, code, message, hint };
	if (isStackUseful(stack)) envelope.stack = stack;
	if (details) envelope.details = details;
	return JSON.stringify(envelope);
}

export function parseToolErrorEnvelope(text: string): ToolErrorEnvelope | null {
	if (!text.startsWith('{"_is_error":true')) return null;
	try {
		const parsed: unknown = JSON.parse(text);
		if (typeof parsed !== "object" || parsed === null) return null;
		const rec = parsed as Record<string, unknown>;
		if (
			rec._is_error === true &&
			typeof rec.code === "string" &&
			typeof rec.message === "string"
		) {
			const envelope: ToolErrorEnvelope = {
				_is_error: true,
				code: rec.code,
				message: rec.message,
				hint: typeof rec.hint === "string" ? rec.hint : "",
			};
			if (isStackUseful(rec.stack)) {
				envelope.stack = rec.stack;
			}
			if (typeof rec.details === "object" && rec.details !== null) {
				envelope.details = rec.details as Record<string, unknown>;
			}
			return envelope;
		}
		return null;
	} catch {
		return null;
	}
}

export function isToolErrorEnvelope(text: string): boolean {
	return parseToolErrorEnvelope(text) !== null;
}

export function renderToolOutput(text: string): string {
	const envelope = parseToolErrorEnvelope(text);
	if (!envelope) return text;
	const detailsSection = envelope.details
		? `\nDetails:\n${JSON.stringify(envelope.details, null, 2)}`
		: "";
	const stackSection = envelope.stack ? `\nStack:\n${envelope.stack}` : "";
	return `[${envelope.code}] ${envelope.message}\nRecovery: ${envelope.hint}${detailsSection}${stackSection}`;
}
