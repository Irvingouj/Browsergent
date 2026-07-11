import { expect, test } from "@playwright/test";
import {
	configureMockProvider,
	domClickButton,
	evalOnPanel,
	focusExtensionPage,
	launchExtension,
	openSecondWindow,
	readPanelWindowId,
	startMockAnthropicServer,
	typeTask,
} from "./helpers";

function log(step: string, t0: number, extra?: unknown) {
	console.log(
		`[diag +${Date.now() - t0}ms] ${step}`,
		extra !== undefined ? JSON.stringify(extra) : "",
	);
}

function makeQuickChunk(text: string) {
	return (
		`event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { id: `msg-${text}`, type: "message", role: "assistant", content: [], model: "test", stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } })}\n\n` +
		`event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } })}\n\n` +
		`event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text } })}\n\n` +
		`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: 0 })}\n\n`
	);
}

test("diag two-window independent chats", async () => {
	test.setTimeout(300_000);
	const t0 = Date.now();
	const mock = startMockAnthropicServer({
		responses: [
			{
				chunks: [makeQuickChunk("Reply A")],
				delays: [0, 0, 0, 0],
				stopReason: "end_turn",
			},
			{
				chunks: [makeQuickChunk("Reply B")],
				delays: [0, 0, 0, 0],
				stopReason: "end_turn",
			},
		],
	});
	log("mock up", t0, { url: mock.url });
	const {
		context,
		extensionId,
		sidePanel: panelA,
		close,
	} = await launchExtension();
	log("A launched", t0);
	try {
		const { sidePanel: panelB, windowId: windowB } = await openSecondWindow(
			context,
			extensionId,
			panelA,
		);
		log("B opened", t0, { windowB });
		const windowA = await readPanelWindowId(panelA);
		log("ids", t0, { windowA, windowB });

		log("cfg A start", t0);
		await configureMockProvider(panelA, mock.url);
		log("cfg A done", t0);

		log("cfg B start", t0);
		await configureMockProvider(panelB, mock.url);
		log("cfg B done", t0);

		log("run A", t0);
		await focusExtensionPage(panelA);
		await typeTask(panelA, "task window A");
		await domClickButton(panelA, "Run task");
		log("wait Reply A", t0);
		const gotA = await expect
			.poll(
				async () => {
					const t = await evalOnPanel(panelA, () =>
						document.body.innerText.includes("Reply A"),
					);
					return t;
				},
				{ timeout: 60_000 },
			)
			.toBe(true)
			.then(() => true)
			.catch(() => false);
		log("Reply A", t0, {
			gotA,
			reqs: mock.requestBodies.length,
			body: await evalOnPanel(panelA, () =>
				document.body.innerText.slice(0, 300),
			).catch((e) => String(e)),
		});

		log("run B", t0);
		await focusExtensionPage(panelB);
		await typeTask(panelB, "task window B");
		await domClickButton(panelB, "Run task");
		log("wait Reply B", t0);
		const gotB = await expect
			.poll(
				async () => {
					return evalOnPanel(panelB, () =>
						document.body.innerText.includes("Reply B"),
					);
				},
				{ timeout: 60_000 },
			)
			.toBe(true)
			.then(() => true)
			.catch(() => false);
		log("Reply B", t0, {
			gotB,
			reqs: mock.requestBodies.length,
			body: await evalOnPanel(panelB, () =>
				document.body.innerText.slice(0, 300),
			).catch((e) => String(e)),
		});

		expect(gotA).toBe(true);
		expect(gotB).toBe(true);
	} finally {
		log("closing", t0);
		await Promise.race([close(), new Promise((r) => setTimeout(r, 15_000))]);
		mock.server.close();
		log("done", t0);
	}
});
