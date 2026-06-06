import { test } from "@playwright/test";
import { launchExtension } from "./helpers";

test("debug get_doc", async () => {
	const { sidePanel, close } = await launchExtension();
	
	const messages: string[] = [];
	sidePanel.on("console", (msg) => {
		messages.push(msg.text());
	});
	
	// Wait for init
	await sidePanel.waitForTimeout(3000);

	console.log("=== CONSOLE MESSAGES ===");
	for (const m of messages) {
		console.log(m);
	}

	await close();
});
