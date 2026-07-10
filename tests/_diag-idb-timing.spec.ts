/**
 * Diagnostic: is multi-window boot slow because of IndexedDB.open itself?
 *
 * Collects:
 *  1) Boot-path [idb-timing] console lines from panel A and panel B
 *  2) Pure indexedDB.open() timings in each page (no app controllers)
 *  3) Pure open while the other panel is already holding a connection
 *
 * Not a product gate — prints a summary and always asserts we got numbers.
 */
import { expect, test } from "@playwright/test";
import {
	focusExtensionPage,
	launchExtension,
	openSecondWindow,
	readPanelWindowId,
} from "./helpers";

type TimingLine = { panel: string; text: string; t: number };

function attachIdbConsole(page: import("@playwright/test").Page, panel: string, sink: TimingLine[]) {
	page.on("console", (msg) => {
		const text = msg.text();
		if (text.includes("[idb-timing]") || text.includes("E_BOOT_IDB")) {
			sink.push({ panel, text, t: Date.now() });
			console.log(`[harvest ${panel}] ${text}`);
		}
	});
}

/** Pure open — does not go through IndexedDBStorage / migrate / boot. */
async function pureOpenMs(page: import("@playwright/test").Page): Promise<{
	openMs: number;
	upgraded: boolean;
	blocked: boolean;
	error: string | null;
}> {
	await focusExtensionPage(page);
	return page.evaluate(async () => {
		const t0 = performance.now();
		return await new Promise<{
			openMs: number;
			upgraded: boolean;
			blocked: boolean;
			error: string | null;
		}>((resolve) => {
			let upgraded = false;
			let blocked = false;
			const req = indexedDB.open("browsergent-pure-probe", 1);
			req.onupgradeneeded = () => {
				upgraded = true;
				const db = req.result;
				if (!db.objectStoreNames.contains("t")) db.createObjectStore("t");
			};
			req.onsuccess = () => {
				const openMs = Math.round(performance.now() - t0);
				req.result.close();
				resolve({ openMs, upgraded, blocked, error: null });
			};
			req.onerror = () => {
				resolve({
					openMs: Math.round(performance.now() - t0),
					upgraded,
					blocked,
					error: String(req.error?.message ?? "error"),
				});
			};
			req.onblocked = () => {
				blocked = true;
			};
		});
	});
}

/** Pure open of the REAL app DB name (may share connections with the app). */
async function pureOpenAppDbMs(page: import("@playwright/test").Page): Promise<{
	openMs: number;
	upgraded: boolean;
	blocked: boolean;
	error: string | null;
}> {
	await focusExtensionPage(page);
	return page.evaluate(async () => {
		const t0 = performance.now();
		return await new Promise<{
			openMs: number;
			upgraded: boolean;
			blocked: boolean;
			error: string | null;
		}>((resolve) => {
			let upgraded = false;
			let blocked = false;
			// Same name/version as IndexedDBStorage — measures real shared DB open.
			const req = indexedDB.open("browsergent", 2);
			req.onupgradeneeded = () => {
				upgraded = true;
			};
			req.onsuccess = () => {
				const openMs = Math.round(performance.now() - t0);
				// Keep connection open briefly so second panel can race a held conn.
				setTimeout(() => {
					try {
						req.result.close();
					} catch {
						/* ok */
					}
				}, 5_000);
				resolve({ openMs, upgraded, blocked, error: null });
			};
			req.onerror = () => {
				resolve({
					openMs: Math.round(performance.now() - t0),
					upgraded,
					blocked,
					error: String(req.error?.message ?? "error"),
				});
			};
			req.onblocked = () => {
				blocked = true;
			};
		});
	});
}

function parseOpenMs(lines: TimingLine[], panel: string): number | null {
	const hit = [...lines]
		.reverse()
		.find((l) => l.panel === panel && l.text.includes("onsuccess"));
	if (!hit) return null;
	const m = hit.text.match(/"openMs"\s*:\s*(\d+)/);
	return m ? Number(m[1]) : null;
}

test("diag: measure IndexedDB open A vs B (boot + pure)", async () => {
	test.setTimeout(180_000);
	const lines: TimingLine[] = [];
	const t0 = Date.now();

	const { context, extensionId, sidePanel: panelA, close } =
		await launchExtension();
	// launchExtension already booted A — reload with listener to capture [idb-timing].
	attachIdbConsole(panelA, "A", lines);
	await panelA.reload({ waitUntil: "domcontentloaded" });
	await panelA.waitForFunction(
		() => {
			const el = document.querySelector("[data-initialized]");
			return (
				el?.getAttribute("data-initialized") === "true" &&
				(el.getAttribute("data-worker-ready") === "true" ||
					el.getAttribute("data-boot-worker") === "ok")
			);
		},
		null,
		{ timeout: 60_000 },
	);
	await new Promise((r) => setTimeout(r, 500));

	const pureA_freshName = await pureOpenMs(panelA);
	console.log("[summary] pure open unrelated DB name on A", pureA_freshName);

	const pureA_appDb = await pureOpenAppDbMs(panelA);
	console.log("[summary] pure open app DB 'browsergent' on A", pureA_appDb);

	const windowA = await readPanelWindowId(panelA);
	console.log("[summary] windowA", windowA, "elapsed", Date.now() - t0);

	const { sidePanel: panelB, windowId: windowB } = await openSecondWindow(
		context,
		extensionId,
		panelA,
		{
			onPage: (p) => attachIdbConsole(p, "B", lines),
		},
	);
	console.log(
		"[summary] openSecondWindow done",
		{ windowB, elapsed: Date.now() - t0 },
	);

	// Give B boot a moment to emit idb-timing (or fast-gate error).
	await new Promise((r) => setTimeout(r, 3_000));

	let pureB_freshName = { openMs: -1, upgraded: false, blocked: false, error: "skip" as string | null };
	let pureB_appDb = { openMs: -1, upgraded: false, blocked: false, error: "skip" as string | null };
	try {
		pureB_freshName = await pureOpenMs(panelB);
		console.log("[summary] pure open unrelated DB name on B", pureB_freshName);
		pureB_appDb = await pureOpenAppDbMs(panelB);
		console.log("[summary] pure open app DB 'browsergent' on B", pureB_appDb);
	} catch (e) {
		console.log("[summary] pure open on B failed (CDP?)", String(e));
	}

	// Also: open app DB from A again while B is up.
	let pureA_again = { openMs: -1, error: "skip" as string | null };
	try {
		pureA_again = await pureOpenAppDbMs(panelA);
		console.log("[summary] pure open app DB on A again (B open)", pureA_again);
	} catch (e) {
		console.log("[summary] pure open on A again failed", String(e));
	}

	const bootOpenA = parseOpenMs(lines, "A");
	const bootOpenB = parseOpenMs(lines, "B");
	const bootLines = lines.filter((l) => l.text.includes("[idb-timing]"));
	const errLines = lines.filter((l) => l.text.includes("E_BOOT_IDB"));

	console.log("========== IDB TIMING SUMMARY ==========");
	console.log("boot IndexedDBStorage onsuccess openMs A:", bootOpenA);
	console.log("boot IndexedDBStorage onsuccess openMs B:", bootOpenB);
	console.log("pure unrelated DB A openMs:", pureA_freshName.openMs);
	console.log("pure unrelated DB B openMs:", pureB_freshName.openMs);
	console.log("pure app DB A openMs:", pureA_appDb.openMs);
	console.log("pure app DB B openMs:", pureB_appDb.openMs);
	console.log("pure app DB A again openMs:", pureA_again.openMs);
	console.log("E_BOOT_IDB lines:", errLines.length);
	for (const l of errLines) console.log(" ", l.panel, l.text.slice(0, 200));
	console.log("all [idb-timing] lines:");
	for (const l of bootLines) console.log(" ", l.panel, l.text);
	console.log("========================================");

	// Soft assertions: we must have measured something on A.
	expect(pureA_freshName.openMs).toBeGreaterThanOrEqual(0);
	expect(pureA_freshName.openMs).toBeLessThan(5_000);
	// If pure open is always fast but boot shows E_BOOT_IDB, problem is not "IDB is slow by nature".
	if (
		pureA_freshName.openMs < 100 &&
		pureB_freshName.openMs >= 0 &&
		pureB_freshName.openMs < 100 &&
		errLines.some((l) => l.panel === "B")
	) {
		console.log(
			"[interpretation] Pure open is fast on A and B, but B boot hit E_BOOT_IDB — " +
				"likely boot race/fast-gate/JS scheduling, NOT multi-second IndexedDB disk work.",
		);
	}
	if (bootOpenB !== null && bootOpenB > 1_500) {
		console.log(
			`[interpretation] Boot path openMs on B was ${bootOpenB}ms — real open callback delay.`,
		);
	}

	await Promise.race([close(), new Promise((r) => setTimeout(r, 15_000))]);
});
