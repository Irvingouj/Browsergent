/**
 * Real multi-window IndexedDB benchmarks.
 *
 * Goal: separate "IndexedDB is slow" from "our boot / CDP / throttle is slow".
 *
 * Prints a machine-readable BENCH JSON block at the end.
 */
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import {
	focusExtensionPage,
	launchExtension,
	openSecondWindow,
	readPanelWindowId,
} from "./helpers";

type Harvest = { panel: string; text: string; t: number };

function attachHarvest(page: Page, panel: string, sink: Harvest[]) {
	page.on("console", (msg) => {
		const text = msg.text();
		if (
			text.includes("[idb-timing]") ||
			text.includes("E_BOOT_IDB") ||
			text.includes("[bench-idb]")
		) {
			sink.push({ panel, text, t: Date.now() });
			console.log(`[${panel}] ${text}`);
		}
	});
}

/** Run a pure IDB microbench inside a page (no app controllers). */
async function runPureBench(
	page: Page,
	label: string,
): Promise<Record<string, number | string | boolean | null>> {
	await focusExtensionPage(page);
	return page.evaluate(async (benchLabel) => {
		const out: Record<string, number | string | boolean | null> = {
			label: benchLabel,
		};
		const timeOpen = (name: string, version: number) =>
			new Promise<number>((resolve, reject) => {
				const t0 = performance.now();
				const req = indexedDB.open(name, version);
				req.onupgradeneeded = () => {
					const db = req.result;
					if (!db.objectStoreNames.contains("kv")) {
						db.createObjectStore("kv");
					}
				};
				req.onsuccess = () => {
					const ms = Math.round(performance.now() - t0);
					req.result.close();
					resolve(ms);
				};
				req.onerror = () =>
					reject(new Error(req.error?.message ?? "open failed"));
				req.onblocked = () => {
					console.info(
						`[bench-idb] blocked ${JSON.stringify({ name, ms: Math.round(performance.now() - t0) })}`,
					);
				};
			});

		const openAndKeep = (name: string, version: number) =>
			new Promise<IDBDatabase>((resolve, reject) => {
				const t0 = performance.now();
				const req = indexedDB.open(name, version);
				req.onupgradeneeded = () => {
					const db = req.result;
					if (!db.objectStoreNames.contains("kv")) {
						db.createObjectStore("kv");
					}
					if (!db.objectStoreNames.contains("settings")) {
						db.createObjectStore("settings");
					}
					if (!db.objectStoreNames.contains("sessions")) {
						db.createObjectStore("sessions");
					}
				};
				req.onsuccess = () => {
					console.info(
						`[bench-idb] open_keep ${JSON.stringify({
							name,
							ms: Math.round(performance.now() - t0),
						})}`,
					);
					resolve(req.result);
				};
				req.onerror = () =>
					reject(new Error(req.error?.message ?? "open failed"));
			});

		const timedGet = (db: IDBDatabase, store: string, key: string) =>
			new Promise<number>((resolve, reject) => {
				const t0 = performance.now();
				const tx = db.transaction(store, "readonly");
				const req = tx.objectStore(store).get(key);
				req.onsuccess = () => resolve(Math.round(performance.now() - t0));
				req.onerror = () => reject(new Error("get failed"));
			});

		const timedPut = (
			db: IDBDatabase,
			store: string,
			key: string,
			value: unknown,
		) =>
			new Promise<number>((resolve, reject) => {
				const t0 = performance.now();
				const tx = db.transaction(store, "readwrite");
				tx.objectStore(store).put(value, key);
				tx.oncomplete = () => resolve(Math.round(performance.now() - t0));
				tx.onerror = () => reject(new Error("put failed"));
			});

		// 1) Isolated probe DB
		out.pureOpenProbeMs = await timeOpen("browsergent-bench-probe", 1);

		// 2) Real app DB name/version
		const tApp0 = performance.now();
		const appDb = await openAndKeep("browsergent", 2);
		out.pureOpenAppDbMs = Math.round(performance.now() - tApp0);

		// 3) Trivial get/set on app DB
		out.purePutMs = await timedPut(appDb, "settings", "__bench_ping", {
			t: Date.now(),
		});
		out.pureGetMs = await timedGet(appDb, "settings", "__bench_ping");
		out.pureGetMigratedMs = await timedGet(appDb, "settings", "__migrated");

		// 4) Burst: 20 sequential gets
		const burst: number[] = [];
		for (let i = 0; i < 20; i++) {
			burst.push(await timedGet(appDb, "settings", "__migrated"));
		}
		out.burstGetMinMs = Math.min(...burst);
		out.burstGetMaxMs = Math.max(...burst);
		out.burstGetAvgMs = Math.round(
			burst.reduce((a, b) => a + b, 0) / burst.length,
		);

		appDb.close();
		console.info(`[bench-idb] result ${JSON.stringify(out)}`);
		return out;
	}, label);
}

function parseBootOpenMs(lines: Harvest[], panel: string): number | null {
	const hit = [...lines]
		.reverse()
		.find((l) => l.panel === panel && /onsuccess/.test(l.text) && /openMs/.test(l.text));
	if (!hit) return null;
	const m = hit.text.match(/"openMs"\s*:\s*(\d+)/);
	return m ? Number(m[1]) : null;
}

function parseMigrateMs(lines: Harvest[], panel: string): number | null {
	const hit = [...lines]
		.reverse()
		.find(
			(l) =>
				l.panel === panel &&
				(l.text.includes("migrate_skip") || l.text.includes("migrate_did")),
		);
	if (!hit) return null;
	const m = hit.text.match(/"ms"\s*:\s*(\d+)/);
	return m ? Number(m[1]) : null;
}

function parseSlowOps(lines: Harvest[]): Array<{ panel: string; text: string }> {
	return lines
		.filter((l) => l.text.includes("op_slow") || l.text.includes("op_done"))
		.filter((l) => {
			const m = l.text.match(/"ms"\s*:\s*(\d+)/);
			return m ? Number(m[1]) >= 50 : false;
		})
		.map((l) => ({ panel: l.panel, text: l.text }));
}

test("bench: multi-window IndexedDB open/get/set", async () => {
	test.setTimeout(240_000);
	const harvest: Harvest[] = [];
	const wall0 = Date.now();

	const { context, extensionId, sidePanel: panelA, close } =
		await launchExtension();

	// Capture boot timings on A via reload
	attachHarvest(panelA, "A", harvest);
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
	await new Promise((r) => setTimeout(r, 300));

	const benchA_alone = await runPureBench(panelA, "A_alone");
	const windowA = await readPanelWindowId(panelA);

	const { sidePanel: panelB, windowId: windowB } = await openSecondWindow(
		context,
		extensionId,
		panelA,
		{ onPage: (p) => attachHarvest(p, "B", harvest) },
	);
	// Let B finish background idb path / shell
	await new Promise((r) => setTimeout(r, 5_000));

	// Pure benches while BOTH panels exist (focus each before measure)
	let benchB_dual: Record<string, number | string | boolean | null> = {
		label: "B_dual",
		error: "cdp_failed",
	};
	let benchA_dual: Record<string, number | string | boolean | null> = {
		label: "A_dual",
		error: "cdp_failed",
	};
	try {
		benchB_dual = await runPureBench(panelB, "B_dual_both_open");
	} catch (e) {
		console.log("[bench] B pure bench failed", String(e));
	}
	try {
		benchA_dual = await runPureBench(panelA, "A_dual_both_open");
	} catch (e) {
		console.log("[bench] A pure bench failed", String(e));
	}

	// Concurrent pure open of app DB from A and B at the same time
	let concurrent: Record<string, unknown> = { error: "skip" };
	try {
		await focusExtensionPage(panelA);
		await focusExtensionPage(panelB);
		const [aOpen, bOpen] = await Promise.all([
			panelA.evaluate(() => {
				const t0 = performance.now();
				return new Promise<number>((resolve, reject) => {
					const req = indexedDB.open("browsergent", 2);
					req.onsuccess = () => {
						const ms = Math.round(performance.now() - t0);
						req.result.close();
						resolve(ms);
					};
					req.onerror = () => reject(new Error("a open fail"));
				});
			}),
			panelB.evaluate(() => {
				const t0 = performance.now();
				return new Promise<number>((resolve, reject) => {
					const req = indexedDB.open("browsergent", 2);
					req.onsuccess = () => {
						const ms = Math.round(performance.now() - t0);
						req.result.close();
						resolve(ms);
					};
					req.onerror = () => reject(new Error("b open fail"));
				});
			}),
		]);
		concurrent = { aOpenMs: aOpen, bOpenMs: bOpen };
		console.log("[bench] concurrent open A+B", concurrent);
	} catch (e) {
		concurrent = { error: String(e) };
		console.log("[bench] concurrent open failed", String(e));
	}

	const summary = {
		wallMs: Date.now() - wall0,
		windowA,
		windowB,
		bootOpenMsA: parseBootOpenMs(harvest, "A"),
		bootOpenMsB: parseBootOpenMs(harvest, "B"),
		bootMigrateMsA: parseMigrateMs(harvest, "A"),
		bootMigrateMsB: parseMigrateMs(harvest, "B"),
		eBootIdbCount: harvest.filter((h) => h.text.includes("E_BOOT_IDB")).length,
		benchA_alone,
		benchB_dual,
		benchA_dual,
		concurrent,
		slowOps: parseSlowOps(harvest).slice(0, 40),
		allIdbTimingCount: harvest.filter((h) => h.text.includes("[idb-timing]"))
			.length,
	};

	console.log("========== BENCH JSON ==========");
	console.log(JSON.stringify(summary, null, 2));
	console.log("========== END BENCH ==========");

	// Interpretation helpers
	const openA = Number(benchA_alone.pureOpenAppDbMs ?? -1);
	const openB = Number(benchB_dual.pureOpenAppDbMs ?? -1);
	const getA = Number(benchA_alone.pureGetMs ?? -1);
	const getB = Number(benchB_dual.pureGetMs ?? -1);
	console.log("---------- INTERPRETATION ----------");
	if (openA >= 0 && openA < 100 && openB >= 0 && openB < 100) {
		console.log(
			"Pure app-DB open is FAST on both panels while dual-open → multi-window open itself is OK when focused + measured in isolation.",
		);
	}
	if (openA >= 0 && openA < 100 && openB > 1000) {
		console.log(
			"Pure open SLOW only on B → multi-window / background scheduling on second document.",
		);
	}
	if (
		summary.bootOpenMsB !== null &&
		summary.bootOpenMsB > 1500 &&
		openB >= 0 &&
		openB < 100
	) {
		console.log(
			"Boot open was slow but pure open later is fast → boot-time contention/throttle, not permanent IDB death.",
		);
	}
	if (getB > 1000 || (summary.bootMigrateMsB !== null && summary.bootMigrateMsB > 1000)) {
		console.log(
			"Trivial get/migrate slow on B → IDB callback scheduling under dual panel, not large data.",
		);
	}
	console.log("------------------------------------");

	// Hard checks: A alone must be healthy (proves IDB works in this environment)
	expect(Number(benchA_alone.pureOpenAppDbMs)).toBeGreaterThanOrEqual(0);
	expect(Number(benchA_alone.pureOpenAppDbMs)).toBeLessThan(2_000);
	expect(Number(benchA_alone.pureGetMs)).toBeLessThan(2_000);

	await Promise.race([close(), new Promise((r) => setTimeout(r, 20_000))]);
});
