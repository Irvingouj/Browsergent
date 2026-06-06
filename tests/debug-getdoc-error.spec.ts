import { test } from "@playwright/test";
import { launchExtension } from "./helpers";

test("debug get_doc error source", async () => {
	const { sidePanel, close } = await launchExtension();

	const errors: { text: string; type: string }[] = [];

	sidePanel.on("console", (msg) => {
		const text = msg.text();
		if (text.includes("document") || text.includes("ERROR") || text.includes("Error") || text.includes("error")) {
			errors.push({ text, type: msg.type() });
		}
	});

	// Wait for JS controller init
	await sidePanel.waitForTimeout(3000);

	// Run a get_doc call via the JS console by executing a script that
	// calls the worker's get_doc path
	await sidePanel.evaluate(async () => {
		// Send a jsRun message to the worker with code that imports generateApiDocs
		// Actually, let's just trigger the agent with a task that will call get_doc
	});

	// Actually, let's start the agent with a mock server that sends get_doc
	// But the simplest way is to run the same test with a debug mock
	await sidePanel.waitForTimeout(2000);

	console.log("=== ERRORS ===");
	for (const e of errors) {
		console.log(`[${e.type}] ${e.text}`);
	}

	await close();
});
