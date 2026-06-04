export interface ToolErrorEnvelope {
	_is_error: true;
	code: string;
	message: string;
	hint: string;
}

// Tools return envelopes instead of throwing because the SDK hardcodes is_error: false on tool results.
// The conversion layer (sdk-message-conversion.ts) detects these envelopes and sets is_error: true.
export function formatToolError(
	code: string,
	message: string,
	hint: string,
): string {
	return JSON.stringify({
		_is_error: true,
		code,
		message,
		hint,
	} satisfies ToolErrorEnvelope);
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
			return {
				_is_error: true,
				code: rec.code,
				message: rec.message,
				hint: typeof rec.hint === "string" ? rec.hint : "",
			};
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
	return `[${envelope.code}] ${envelope.message}\nRecovery: ${envelope.hint}`;
}
