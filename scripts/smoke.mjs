#!/usr/bin/env node
// scripts/smoke.mjs
//
// One-command smoke harness for Browsergent.
//   1. builds the extension (npm run build → dist/)
//   2. serves ./smoke over local HTTP
//   3. launches Chrome with the extension loaded
//   4. drives each scenario against REAL DeepSeek (key from ~/rc.deepseek.rc)
//   5. archives everything (conversation, chat, trace, screenshots, logs) per run
//
// Usage:
//   npm run smoke              # run every scenario
//   npm run smoke -- form-login # run one scenario
//   SMOKE_HEADED=1 npm run smoke  # watch it live
//
// Requires: a real DEEPSEEK_API_KEY in ~/rc.deepseek.rc (or env).

import { execSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";

const ROOT = path.resolve(import.meta.dirname, "..");
const SMOKE = path.join(ROOT, "smoke");
const DIST = path.join(ROOT, "dist");
const HEADED = process.env.SMOKE_HEADED === "1";

// ---------- 1. args + manifest ----------
const only = process.argv[2];
const manifest = JSON.parse(
	readFileSync(path.join(SMOKE, "scenarios.json"), "utf8"),
);
let scenarios = manifest.scenarios;
if (only) {
	scenarios = scenarios.filter((s) => s.id === only);
	if (scenarios.length === 0) {
		console.error(
			`Unknown scenario "${only}". Known: ${manifest.scenarios.map((s) => s.id).join(", ")}`,
		);
		process.exit(2);
	}
}

// ---------- 2. DeepSeek credentials ----------
function parseRc(p) {
	if (!existsSync(p)) return {};
	return Object.fromEntries(
		readFileSync(p, "utf8")
			.split("\n")
			.filter((l) => l && !l.trim().startsWith("#") && l.includes("="))
			.map((l) => {
				const i = l.indexOf("=");
				return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
			}),
	);
}
const rc = parseRc(path.join(os.homedir(), "rc.deepseek.rc"));
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || rc.DEEPSEEK_API_KEY;
if (!DEEPSEEK_API_KEY) {
	console.error(
		"Missing DEEPSEEK_API_KEY. Put it in ~/rc.deepseek.rc as DEEPSEEK_API_KEY=... or export it.",
	);
	process.exit(1);
}
const DEEPSEEK_BASE_URL =
	process.env.DEEPSEEK_BASE_URL ||
	rc.DEEPSEEK_BASE_URL ||
	"https://api.deepseek.com/anthropic";
const DEEPSEEK_MODEL =
	process.env.DEEPSEEK_MODEL || rc.DEEPSEEK_MODEL || "deepseek-chat";

// ---------- 3. build ----------
console.log("▶ building extension (npm run build)…");
execSync("npm run build", { cwd: ROOT, stdio: "inherit" });
if (!existsSync(DIST)) {
	console.error("build did not produce dist/");
	process.exit(1);
}

// ---------- 4. static server for ./smoke ----------
const MIME = {
	".html": "text/html",
	".json": "application/json",
	".pdf": "application/pdf",
	".js": "text/javascript",
	".css": "text/css",
	".svg": "image/svg+xml",
};
const server = createServer(async (req, res) => {
	let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
	if (urlPath === "/") urlPath = "/index.html";
	const filePath = path.join(SMOKE, urlPath);
	if (filePath !== SMOKE && !filePath.startsWith(SMOKE + path.sep)) {
		res.writeHead(403);
		res.end();
		return;
	}
	try {
		const data = await readFile(filePath);
		res.writeHead(200, {
			"Content-Type":
				MIME[path.extname(filePath).toLowerCase()] ||
				"application/octet-stream",
			"Access-Control-Allow-Origin": "*",
		});
		res.end(data);
	} catch {
		res.writeHead(404);
		res.end("not found");
	}
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const BASE = `http://127.0.0.1:${server.address().port}`;
console.log(`▶ serving smoke sites at ${BASE}`);

// ---------- 5. launch extension ----------
const userDataDir = path.join(os.tmpdir(), `browsergent-smoke-${Date.now()}`);
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const runsDir = path.join(SMOKE, "runs", stamp);
mkdirSync(runsDir, { recursive: true });

let context;
try {
	context = await chromium.launchPersistentContext(userDataDir, {
		channel: "chromium",
		headless: !HEADED,
		args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
	});
	let serviceWorker = context.serviceWorkers()[0];
	if (!serviceWorker)
		serviceWorker = await context.waitForEvent("serviceworker");
	const extensionId = serviceWorker.url().split("/")[2];

	const sidePanel = await context.newPage();
	const panelConsole = [];
	sidePanel.on("console", (m) =>
		panelConsole.push(`[${m.type()}] ${m.text()}`),
	);
	sidePanel.on("pageerror", (e) =>
		panelConsole.push(`[pageerror] ${e.message}`),
	);

	async function openSidePanel() {
		await sidePanel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
		await sidePanel.waitForSelector('[data-initialized="true"]', {
			timeout: 20000,
		});
		await sidePanel.waitForSelector('[data-worker-ready="true"]', {
			timeout: 20000,
		});
	}

	async function configureProvider() {
		// Mirrors the proven real-deepseek e2e flow.
		await sidePanel.getByRole("button", { name: "More options" }).click();
		await sidePanel.getByRole("button", { name: "Open settings" }).click();
		await sidePanel.locator('input[type="password"]').fill(DEEPSEEK_API_KEY);
		await sidePanel
			.locator('input[type="text"]')
			.nth(0)
			.fill(DEEPSEEK_BASE_URL);
		await sidePanel.locator('input[type="text"]').nth(1).fill(DEEPSEEK_MODEL);
		await sidePanel.getByRole("button", { name: "Save settings" }).click();
		await sidePanel.getByTestId("close-session-panel").click();
	}

	console.log("▶ opening side panel + configuring DeepSeek…");
	await openSidePanel();
	await configureProvider();

	// ---------- 6. run scenarios ----------

	async function waitForAgentDone(timeoutMs) {
		// The run-button/stop-button toggle is the ground-truth idle signal — the
		// status text oscillates between turns, so polling it catches transients.
		// 1. confirm the run started (stop-button shows), then
		// 2. wait for the run to finish (run-button reappears).
		await sidePanel
			.locator('[data-testid="stop-button"]')
			.waitFor({ state: "visible", timeout: 30000 })
			.catch(() => {});
		await sidePanel
			.locator('[data-testid="run-button"]')
			.waitFor({ state: "visible", timeout: timeoutMs });
	}

	async function captureChat() {
		const msgs = await sidePanel
			.locator('[data-testid^="chat-message-"]')
			.allTextContents();
		return msgs;
	}

	async function captureTrace() {
		// Expand every collapsed trace entry, then read its text.
		const entries = sidePanel.locator('[data-testid="trace-entry"]');
		const count = await entries.count();
		for (let i = 0; i < count; i++) {
			await entries
				.nth(i)
				.click()
				.catch(() => {});
		}
		return count === 0 ? [] : await entries.allTextContents();
	}

	async function newSession() {
		// Start a fresh agent session: clears chat/trace/diagnostics and resets the agent.
		// Provider settings persist in storage, so DeepSeek stays configured.
		await sidePanel.getByRole("button", { name: "More options" }).click();
		await sidePanel.getByTestId("new-session-button").click();
		await sidePanel.waitForSelector('[data-testid="run-button"]', {
			timeout: 10000,
		});
	}

	async function runScenario(sc) {
		const scenarioDir = path.join(runsDir, sc.id);
		mkdirSync(scenarioDir, { recursive: true });

		// Fresh agent session per scenario (settings persist in storage).
		await newSession();
		const apiCalls = [];
		await sidePanel.route("**/v1/messages**", async (route) => {
			const req = route.request();
			const postData = req.postData();
			if (postData) apiCalls.push({ direction: "request", body: postData });
			try {
				const response = await route.fetch();
				const respBody = await response.text();
				apiCalls.push({ direction: "response", body: respBody });
				await route.fulfill({ response });
			} catch {
				apiCalls.push({ direction: "response", body: "(context closed)" });
			}
		});

		// Open + focus the target page.
		const target = await context.newPage();
		try {
			const targetConsole = [];
			target.on("console", (m) =>
				targetConsole.push(`[${m.type()}] ${m.text()}`),
			);
			await target.goto(`${BASE}/${sc.site}`, {
				waitUntil: "domcontentloaded",
			});
			await target.bringToFront();
			await sidePanel.bringToFront();

			const targetUrl = `${BASE}/${sc.site}`;
			const task =
				`The target web page is already open in the active browser tab at:\n${targetUrl}\n` +
				`Do NOT navigate to a different URL — snapshot the current page and act on it.\n\n` +
				sc.task.replaceAll("{BASE}", BASE);
			await sidePanel.locator('[data-testid="task-input"]').fill(task);
			const startedAt = Date.now();
			await sidePanel.getByTestId("run-button").click();

			let finalStatus = "timeout";
			try {
				await waitForAgentDone(sc.timeoutMs);
			} catch {
				finalStatus = "timeout";
			}
			finalStatus = (
				(await sidePanel
					.locator('[data-testid="agent-status"]')
					.textContent()) || ""
			).trim();

			const durationMs = Date.now() - startedAt;

			// Capture everything.
			const chat = await captureChat();
			const trace = await captureTrace();
			const targetText = (await target.content())
				.replace(/\s+/g, " ")
				.slice(0, 50000);
			const doneHintFound =
				sc.doneHint &&
				([...chat, ...trace, targetText].some((t) => t.includes(sc.doneHint)) ||
					apiCalls.some((c) => c.body.includes(sc.doneHint)));

			await sidePanel.screenshot({
				path: path.join(scenarioDir, "sidepanel.png"),
				fullPage: true,
			});
			await target.screenshot({
				path: path.join(scenarioDir, "target.png"),
				fullPage: true,
			});

			writeFileSync(
				path.join(scenarioDir, "conversation.json"),
				JSON.stringify(apiCalls, null, 2),
			);
			writeFileSync(
				path.join(scenarioDir, "chat.txt"),
				chat.join("\n\n---\n\n"),
			);
			writeFileSync(
				path.join(scenarioDir, "trace.txt"),
				trace.join("\n\n---\n\n"),
			);
			writeFileSync(path.join(scenarioDir, "target.html.txt"), targetText);
			writeFileSync(
				path.join(scenarioDir, "sidepanel-console.log"),
				panelConsole.splice(0).join("\n"),
			);
			writeFileSync(
				path.join(scenarioDir, "target-console.log"),
				targetConsole.join("\n"),
			);
			writeFileSync(
				path.join(scenarioDir, "result.json"),
				JSON.stringify(
					{
						id: sc.id,
						name: sc.name,
						task,
						model: DEEPSEEK_MODEL,
						baseUrl: DEEPSEEK_BASE_URL,
						finalStatus,
						durationMs,
						doneHint: sc.doneHint,
						doneHintFound: Boolean(doneHintFound),
					},
					null,
					2,
				),
			);

			return {
				id: sc.id,
				finalStatus,
				durationMs,
				doneHintFound: Boolean(doneHintFound),
			};
		} finally {
			await target.close().catch(() => {});
			await sidePanel.unroute("**/v1/messages**").catch(() => {});
		}
	}

	const summary = [];
	for (const sc of scenarios) {
		console.log(`\n▶ scenario: ${sc.id} — ${sc.name}`);
		try {
			const r = await runScenario(sc);
			summary.push(r);
			console.log(
				`  → ${r.finalStatus} in ${(r.durationMs / 1000).toFixed(1)}s (hint:${r.doneHintFound ? "yes" : "no"})`,
			);
		} catch (e) {
			summary.push({
				id: sc.id,
				finalStatus: "crash",
				error: String(e?.stack || e),
			});
			console.error(`  → crash: ${e}`);
		}
	}

	// ---------- 7. archive ----------
	writeFileSync(
		path.join(runsDir, "summary.json"),
		JSON.stringify(summary, null, 2),
	);
} finally {
	await context?.close().catch(() => {});
	server.close();
	rmSync(userDataDir, { recursive: true, force: true });
}

const archive = `${runsDir}.zip`;
try {
	execSync(`zip -rq "${archive}" "${runsDir}"`, { cwd: SMOKE });
	console.log(`\n▶ archived: ${path.relative(ROOT, archive)}`);
} catch {
	try {
		execSync(
			`tar -czf "${archive.replace(/\.zip$/, ".tar.gz")}" -C "${SMOKE}" "${path.relative(SMOKE, runsDir)}"`,
		);
		console.log(
			`\n▶ archived: ${path.relative(ROOT, archive.replace(/\.zip$/, ".tar.gz"))}`,
		);
	} catch {
		console.log(`\n▶ run dir left unarchived: ${path.relative(ROOT, runsDir)}`);
	}
}
console.log(`▶ run dir:  ${path.relative(ROOT, runsDir)}`);
console.log("\nSummary:");
for (const s of summary) {
	console.log(
		`  ${s.id.padEnd(16)} ${s.finalStatus}${s.doneHintFound ? "  ✓hint" : ""}`,
	);
}
