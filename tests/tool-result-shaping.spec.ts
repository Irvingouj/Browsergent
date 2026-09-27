import { expect, test } from "@playwright/test";
import {
	configureMockProvider,
	launchExtension,
	startMockAnthropicServer,
	typeTask,
} from "./helpers";

/**
 * A page dump must not stay whole in the conversation the user sees,
 * or in the next model request. The full text stays in the session files.
 *
 * The body is built so ONLYINTHEMIDDLE sits past a 48k-character head
 * and before a 16k-character tail — outside every legal head/tail window.
 */

const HEAD = "HEADTOKEN";
const TAIL = "TAILTOKEN";
const NEEDLE = "ONLYINTHEMIDDLE";

const MSG_START = (id: string) =>
	`event: message_start\ndata: ${JSON.stringify({
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

const BLOCK_STOP = `event: content_block_stop\ndata: ${JSON.stringify({
	type: "content_block_stop",
	index: 0,
})}\n\n`;

function toolUseChunk(
	index: number,
	id: string,
	name: string,
	input: Record<string, unknown>,
): string {
	return [
		`event: content_block_start\ndata: ${JSON.stringify({
			type: "content_block_start",
			index,
			content_block: { type: "tool_use", id, name, input: {} },
		})}\n\n`,
		`event: content_block_delta\ndata: ${JSON.stringify({
			type: "content_block_delta",
			index,
			delta: { type: "input_json_delta", partial_json: JSON.stringify(input) },
		})}\n\n`,
		`event: content_block_stop\ndata: ${JSON.stringify({
			type: "content_block_stop",
			index,
		})}\n\n`,
	].join("");
}

test("a huge page dump keeps its head and tail, and the middle stays in a file", async () => {
	test.setTimeout(90_000);
	const code = `return ${JSON.stringify(HEAD)} + "a".repeat(60000) + ${JSON.stringify(NEEDLE)} + "b".repeat(60000) + ${JSON.stringify(TAIL)};`;
	const mock = startMockAnthropicServer({
		responses: [
			{
				chunks: [
					MSG_START("msg-1"),
					toolUseChunk(0, "tc-page", "run_js", { code }),
					BLOCK_STOP,
				],
				delays: [0, 0, 0],
				stopReason: "tool_use",
			},
			{
				chunks: [
					MSG_START("msg-2"),
					`event: content_block_start\ndata: ${JSON.stringify({
						type: "content_block_start",
						index: 0,
						content_block: { type: "text", text: "" },
					})}\n\n`,
					`event: content_block_delta\ndata: ${JSON.stringify({
						type: "content_block_delta",
						index: 0,
						delta: { type: "text_delta", text: "Page noted." },
					})}\n\n`,
					BLOCK_STOP,
				],
				delays: [0, 0, 0],
				stopReason: "end_turn",
			},
		],
	});

	const { sidePanel, close } = await launchExtension();
	await configureMockProvider(sidePanel, mock.url);
	await typeTask(sidePanel, "read the page");
	await sidePanel.getByRole("button", { name: "Run task" }).click();

	await expect(sidePanel.getByText("Page noted.")).toBeVisible({
		timeout: 30_000,
	});

	await sidePanel.getByTestId("trace-entry").click();
	const shown = sidePanel.getByTestId("tool-result-body");
	await expect(shown).toContainText(HEAD);
	await expect(shown).toContainText(TAIL);
	await expect(shown).toContainText("characters omitted");
	await expect(shown).toContainText("/artifacts/");
	await expect(shown).not.toContainText(NEEDLE);

	const followUp = JSON.stringify(mock.requestBodies[1] ?? "");
	// The tool call source mentions the needle once. The page body must not.
	expect(followUp.split(NEEDLE).length - 1).toBe(1);
	expect(followUp).not.toContain("a".repeat(30_000));

	await sidePanel.getByRole("button", { name: "Files" }).click();
	await sidePanel
		.getByTestId("tree-directory")
		.filter({ hasText: "artifacts" })
		.click();
	await sidePanel.getByTestId("tree-file").click();
	await expect(sidePanel.getByTestId("text-preview-textarea")).toHaveValue(
		new RegExp(NEEDLE),
		{ timeout: 15_000 },
	);

	await close();
	mock.server.close();
});
