import type { Server } from "node:http";
import { createServer } from "node:http";
import { expect, test } from "@playwright/test";
import {
	configureMockProvider,
	focusTargetTab,
	launchExtension,
	startMockAnthropicServer,
} from "./helpers";

// Fixture: clicking the Branch button inserts an unrelated child node
// (childList mutation). Under the lazy observation lease, only the target
// element's disconnect/fingerprint-change invalidates its refId — a mutation
// elsewhere on the page does NOT. Both clicks must succeed back-to-back.
const HTML = `
<!DOCTYPE html>
<html>
<body>
  <button id="branch" aria-label="Branch">Branch</button>
  <button id="other" aria-label="Other">Other</button>
  <div id="status">idle</div>
  <script>
    document.getElementById('branch').addEventListener('click', () => {
      const chip = document.createElement('div');
      chip.textContent = 'chipped';
      document.body.appendChild(chip);
      document.getElementById('status').textContent = 'chipped';
    });
    document.getElementById('other').addEventListener('click', () => {
      document.getElementById('status').textContent = 'other_clicked';
    });
  </script>
</body>
</html>
`;

const SNAPSHOT_CODE = "await page.snapshot_data();";

// snapshot → click Branch (adds a child → under lazy lease this does NOT
// invalidate other's refId) → click Other. The second click MUST succeed.
const DOUBLE_CLICK_CODE = `const d = await page.snapshot_data();
const branch = d.nodes.find(n => n.name === "Branch");
const other = d.nodes.find(n => n.name === "Other");
await page.click({ refId: branch.refId });
await page.click({ refId: other.refId });
console.log("SECOND_CLICK_OK");`;

function startServer(): Promise<{ url: string; server: Server }> {
	return new Promise((resolve) => {
		const server = createServer((_req, res) => {
			res.writeHead(200, { "Content-Type": "text/html" });
			res.end(HTML);
		});
		server.listen(0, () => {
			const addr = server.address();
			const port = typeof addr === "object" && addr ? addr.port : 0;
			resolve({ url: `http://localhost:${port}`, server });
		});
	});
}

function toolUseChunks(id: string, messageId: string, code: string): string[] {
	return [
		`event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { id: messageId, type: "message", role: "assistant", content: [], model: "test", stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } })}\n\n`,
		`event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "tool_use", id, name: "run_js", input: {} } })}\n\n`,
		`event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify({ code }) } })}\n\n`,
		`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: 0 })}\n\n`,
	];
}

test("observation-action safety: branching click does NOT invalidate lease (E2E)", async () => {
	test.setTimeout(120000);
	const { url, server } = await startServer();

	const mock = startMockAnthropicServer({
		responses: [
			{
				chunks: toolUseChunks("tc1", "m1", SNAPSHOT_CODE),
				delays: [0, 0, 0, 0],
				stopReason: "tool_use",
			},
			{
				chunks: toolUseChunks("tc2", "m2", DOUBLE_CLICK_CODE),
				delays: [0, 0, 0, 0],
				stopReason: "tool_use",
			},
		],
	});

	const { context, sidePanel, close } = await launchExtension();
	const testPage = await context.newPage();
	await testPage.goto(url);
	await focusTargetTab(testPage);
	await configureMockProvider(sidePanel, mock.url);
	await focusTargetTab(testPage);

	await sidePanel
		.locator('[data-testid="task-input"]')
		.fill("click branch then other");
	await focusTargetTab(testPage);
	await sidePanel.getByRole("button", { name: "Run task" }).click();
	// Both clicks fire in one run_js cell. The Branch click sets "chipped"
	// then the Other click sets "other_clicked" — the final state proves both succeeded.

	// …then the Other button fired too, setting status = "other_clicked".
	// Under the lazy lease the second click against the SAME observation
	// must succeed. Give it a brief window then assert the final state.
	// Both clicks should succeed in one run_js cell under the lazy lease.
	// The Branch click sets "chipped", then the Other click sets "other_clicked".
	// Both fire so fast that the final state is "other_clicked" — proving
	// the second click succeeded against the SAME observation (no re-snapshot).
	await expect(testPage.locator("#status")).toHaveText("other_clicked", {
		timeout: 10000,
	});

	server.close();
	await close();
	mock.server.close();
});

test("navigation click can read the destination title in the same run_js cell", async () => {
	test.setTimeout(90000);
	const server = createServer((req, res) => {
		res.writeHead(200, { "Content-Type": "text/html" });
		res.end(
			req.url === "/destination"
				? "<title>Destination</title>"
				: '<a href="/destination">More information...</a>',
		);
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	const url = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}/`;
	const code = `const d = await page.snapshot_data();
const link = d.nodes.find(n => n.name === "More information...");
await page.click({ refId: link.refId });
console.log("DESTINATION_TITLE:" + await page.title());`;
	const mock = startMockAnthropicServer({
		responses: [
			{
				chunks: toolUseChunks("nc1", "nm1", code),
				delays: [0, 0, 0, 0],
				stopReason: "tool_use",
			},
		],
	});
	const { context, sidePanel, close } = await launchExtension();
	const testPage = await context.newPage();
	await testPage.goto(url);
	await focusTargetTab(testPage);
	await configureMockProvider(sidePanel, mock.url);
	await focusTargetTab(testPage);
	await sidePanel
		.locator('[data-testid="task-input"]')
		.fill("open the link and read the title");
	await focusTargetTab(testPage);
	await sidePanel.getByRole("button", { name: "Run task" }).click();

	await sidePanel.getByRole("button", { name: /#1 run_js/ }).click();
	await expect(
		sidePanel.getByText(/DESTINATION_TITLE:Destination/),
	).toBeVisible({ timeout: 30000 });

	server.close();
	await close();
	mock.server.close();
});
// Regression guard for the form-safe lease design: multiple fills on a single
// observation MUST all succeed. This is the core promise — fills don't change
// DOM structure, so they must NOT invalidate the lease. If a future change
// makes fills invalidate (e.g. someone widens the MutationObserver to attributes,
// or adds a consume-on-every-action rule), this test catches it.
const FORM_HTML = `
<!DOCTYPE html>
<html>
<body>
  <form id="form">
    <input id="email" name="email" aria-label="Email" />
    <input id="name" name="name" aria-label="Name" />
    <input id="phone" name="phone" aria-label="Phone" />
  </form>
</body>
</html>
`;

// One snapshot, three fills in a single run_js cell. Under the lease design
// fills do not trigger childList mutations, so all three must succeed.
const MULTI_FILL_CODE = `const d = await page.snapshot_data();
const email = d.nodes.find(n => n.name === "Email");
const name = d.nodes.find(n => n.name === "Name");
const phone = d.nodes.find(n => n.name === "Phone");
await page.fill({ refId: email.refId, value: "a@b.com" });
await page.fill({ refId: name.refId, value: "Alice" });
await page.fill({ refId: phone.refId, value: "5551234" });`;

test("observation-action safety: multiple fills on one observation succeed (form-safe regression guard)", async () => {
	test.setTimeout(90000);
	const formServer = createServer((_req, res) => {
		res.writeHead(200, { "Content-Type": "text/html" });
		res.end(FORM_HTML);
	});
	await new Promise<void>((resolve) =>
		formServer.listen(0, "127.0.0.1", resolve),
	);
	const addr = formServer.address();
	const formUrl = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}/`;

	const mock = startMockAnthropicServer({
		responses: [
			{
				chunks: toolUseChunks("fc1", "fm1", SNAPSHOT_CODE),
				delays: [0, 0, 0, 0],
				stopReason: "tool_use",
			},
			{
				chunks: toolUseChunks("fc2", "fm2", MULTI_FILL_CODE),
				delays: [0, 0, 0, 0],
				stopReason: "tool_use",
			},
		],
	});

	const { context, sidePanel, close } = await launchExtension();
	const testPage = await context.newPage();
	await testPage.goto(formUrl);
	await focusTargetTab(testPage);
	await configureMockProvider(sidePanel, mock.url);
	await focusTargetTab(testPage);

	await sidePanel
		.locator('[data-testid="task-input"]')
		.fill("fill all three fields");
	await focusTargetTab(testPage);
	await sidePanel.getByRole("button", { name: "Run task" }).click();

	// All three inputs must be filled — proves fills do not invalidate the lease.
	await expect(testPage.locator("#email")).toHaveValue("a@b.com", {
		timeout: 30000,
	});
	await expect(testPage.locator("#name")).toHaveValue("Alice", {
		timeout: 5000,
	});
	await expect(testPage.locator("#phone")).toHaveValue("5551234", {
		timeout: 5000,
	});

	formServer.close();
	await close();
	mock.server.close();
});
