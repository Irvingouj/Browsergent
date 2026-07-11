/**
 * Shared Anthropic SSE turn builders for agent-visibility E2E.
 *
 * P0 contract (user-visible, black-box):
 * - After tool-only turns, chat MUST show the final assistant text.
 * - agent-status MUST reach a terminal state (done / stopped / error).
 * - Never assert only "provider was called" without chat bubbles.
 */

export type MockTurn = {
	chunks: string[];
	delays: number[];
	stopReason: "end_turn" | "error" | "tool_use";
};

function messageStart(id: string): string {
	return `event: message_start\ndata: ${JSON.stringify({
		type: "message_start",
		message: {
			id,
			type: "message",
			role: "assistant",
			content: [],
			model: "test",
			stop_reason: null,
			usage: { input_tokens: 10, output_tokens: 0 },
		},
	})}\n\n`;
}

/** Final assistant text turn (end_turn). */
export function finalTextTurn(id: string, text: string): MockTurn {
	const chunks = [
		messageStart(id),
		`event: content_block_start\ndata: ${JSON.stringify({
			type: "content_block_start",
			index: 0,
			content_block: { type: "text", text: "" },
		})}\n\n`,
		`event: content_block_delta\ndata: ${JSON.stringify({
			type: "content_block_delta",
			index: 0,
			delta: { type: "text_delta", text },
		})}\n\n`,
		`event: content_block_stop\ndata: ${JSON.stringify({
			type: "content_block_stop",
			index: 0,
		})}\n\n`,
	];
	return {
		chunks,
		delays: chunks.map(() => 0),
		stopReason: "end_turn",
	};
}

/**
 * Slow text stream so Stop can interrupt mid-delta.
 * delays[2] is the long pause before the text_delta.
 */
export function slowFinalTextTurn(
	id: string,
	text: string,
	delayMs = 8_000,
): MockTurn {
	const turn = finalTextTurn(id, text);
	return {
		...turn,
		delays: turn.chunks.map((_, i) => (i === 2 ? delayMs : 0)),
	};
}

/** Tool-only run_js turn — no assistant text before tool (regression shape). */
export function toolOnlyRunJsTurn(
	toolId: string,
	code: string,
	messageId = `msg-${toolId}`,
): MockTurn {
	const chunks = [
		messageStart(messageId),
		`event: content_block_start\ndata: ${JSON.stringify({
			type: "content_block_start",
			index: 0,
			content_block: {
				type: "tool_use",
				id: toolId,
				name: "run_js",
				input: {},
			},
		})}\n\n`,
		`event: content_block_delta\ndata: ${JSON.stringify({
			type: "content_block_delta",
			index: 0,
			delta: {
				type: "input_json_delta",
				partial_json: JSON.stringify({ code }),
			},
		})}\n\n`,
		`event: content_block_stop\ndata: ${JSON.stringify({
			type: "content_block_stop",
			index: 0,
		})}\n\n`,
	];
	return {
		chunks,
		delays: chunks.map(() => 0),
		stopReason: "tool_use",
	};
}

/** Default safe run_js body for tab listing (no DOM write). */
export const DEFAULT_TAB_LIST_CODE =
	"const tabs = await web.tab.list(); print(String(tabs.length));";
