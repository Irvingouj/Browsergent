import { expect, test } from "@playwright/test";
import {
	configureMockProvider,
	launchExtension,
	startMockAnthropicServer,
	typeTask,
} from "./helpers";

test("provider bad stream", async () => {
	const mock = startMockAnthropicServer({
		responses: [
			{
				chunks: ["invalid json\n\n"],
				delays: [0],
				stopReason: "end_turn",
			},
		],
	});
	const { sidePanel, close } = await launchExtension();
	await configureMockProvider(sidePanel, mock.url);

	await typeTask(sidePanel, "bad stream");
	await sidePanel.getByRole("button", { name: "Run task" }).click();

	await expect(sidePanel.locator('[data-testid="agent-status"]')).toHaveText(
		/error/,
		{ timeout: 10000 },
	);

	await close();
	mock.server.close();
});
