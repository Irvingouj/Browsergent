import { beforeEach, describe, expect, test, vi } from "vitest";
import { BridgeGate } from "../../src/controllers/bridge-gate";
import { BridgeHost } from "../../src/controllers/bridge-host";
import { EnrollmentController } from "../../src/controllers/enrollment-controller";
import { MemoryStorage } from "../../src/storage/memory-storage";
import { createAgentTools } from "../../src/worker/agent-tools";

describe("BridgeGate tool pairing", () => {
	let storage: MemoryStorage;

	beforeEach(() => {
		storage = new MemoryStorage();
	});

	test("CLI run_js is rejected until the enrollment token matches", async () => {
		const runJs = vi.fn().mockResolvedValue({
			status: "ok",
			stdout: [],
			stderr: [],
			result: "ok",
			execution_count: 1,
		});
		const tools = createAgentTools(runJs, vi.fn(), vi.fn(), vi.fn());
		const enrollment = new EnrollmentController(storage);
		const gate = new BridgeGate({
			enrollment,
			tools: new BridgeHost({ tools }),
		});
		const code = "await page.snapshot()";

		const unpaired = await gate.handle({
			id: "req-unpaired",
			token: "guess",
			method: "run_js",
			params: { code },
		});
		expect(unpaired.ok).toBe(false);
		if (unpaired.ok) throw new Error("expected unpaired failure");
		expect(unpaired.error.code).toBe("E_NOT_PAIRED");
		expect(runJs).not.toHaveBeenCalled();

		const token = await enrollment.generate();
		const created = await gate.handle({
			id: "req-run",
			token,
			method: "run_js",
			params: { code },
		});
		expect(created.ok).toBe(true);
		if (!created.ok || created.method !== "run_js") {
			throw new Error("expected run_js success");
		}
		expect(runJs).toHaveBeenCalledWith(code);
	});
});
