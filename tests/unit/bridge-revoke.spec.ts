import { beforeEach, describe, expect, test, vi } from "vitest";
import { BridgeGate } from "../../src/controllers/bridge-gate";
import { BridgeHost } from "../../src/controllers/bridge-host";
import { BridgeSessionHost } from "../../src/controllers/bridge-session-host";
import { EnrollmentController } from "../../src/controllers/enrollment-controller";
import { MemoryStorage } from "../../src/storage/memory-storage";
import { createAgentTools } from "../../src/worker/agent-tools";
import { initBoundController } from "./session-test-utils";

describe("EnrollmentController.revoke", () => {
	let storage: MemoryStorage;

	beforeEach(() => {
		storage = new MemoryStorage();
	});

	test("revoked token cannot create a session or run_js", async () => {
		const { ctrl } = await initBoundController(storage);
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
			sessions: new BridgeSessionHost(ctrl),
			tools: new BridgeHost({ tools }),
		});

		const token = await enrollment.generate();
		const created = await gate.handle({
			id: "req-create",
			token,
			method: "session.create",
		});
		expect(created.ok).toBe(true);

		await enrollment.revoke();

		const afterRevoke = await gate.handle({
			id: "req-create-2",
			token,
			method: "session.create",
		});
		expect(afterRevoke.ok).toBe(false);
		if (afterRevoke.ok) throw new Error("expected revoked session.create failure");
		expect(afterRevoke.error.code).toBe("E_NOT_PAIRED");

		const run = await gate.handle({
			id: "req-run",
			token,
			method: "run_js",
			params: { code: "await page.snapshot()" },
		});
		expect(run.ok).toBe(false);
		if (run.ok) throw new Error("expected revoked run_js failure");
		expect(run.error.code).toBe("E_NOT_PAIRED");
		expect(runJs).not.toHaveBeenCalled();
	});
});
