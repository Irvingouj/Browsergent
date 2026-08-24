import { beforeEach, describe, expect, test, vi } from "vitest";
import { EnrollmentHost } from "../../src/controllers/enrollment-host";
import { browsergentStore } from "../../src/state/store";
import { MemoryStorage } from "../../src/storage/memory-storage";
import { createAgentTools } from "../../src/worker/agent-tools";
import { initBoundController } from "./session-test-utils";

describe("EnrollmentHost session effects", () => {
	let storage: MemoryStorage;

	beforeEach(() => {
		storage = new MemoryStorage();
		browsergentStore.getState().sessionListLoaded([]);
		browsergentStore.getState().clearChat();
		browsergentStore.getState().clearTrace();
	});

	test("CLI session.create lands in the live session list as a CLI session", async () => {
		const { ctrl } = await initBoundController(storage);
		const chatId = ctrl.getActiveSessionId();
		browsergentStore.getState().activeSessionChanged(chatId ?? "");
		const host = new EnrollmentHost({
			storage,
			sessions: ctrl,
			tools: createAgentTools(vi.fn(), vi.fn(), vi.fn(), vi.fn()),
		});
		const token = await host.generate();
		const created = await host.handle({
			id: "req-create",
			token,
			method: "session.create",
		});
		expect(created.ok).toBe(true);
		if (!created.ok || created.method !== "session.create") {
			throw new Error("expected session.create");
		}
		const listed = browsergentStore.getState().session.sessions;
		const item = listed.find((session) => session.id === created.result.id);
		expect(item).toBeDefined();
		expect(item?.origin).toBe("cli");
		expect(ctrl.getActiveSessionId()).toBe(chatId);
		expect(browsergentStore.getState().session.activeSessionId).toBe(chatId);
	});

	test("CLI run_js is persisted on the CLI session as a trace the panel can show", async () => {
		const { ctrl } = await initBoundController(storage);
		const host = new EnrollmentHost({
			storage,
			sessions: ctrl,
			tools: createAgentTools(
				vi.fn().mockResolvedValue({
					status: "ok",
					stdout: [],
					stderr: [],
					result: "2",
					execution_count: 1,
				}),
				vi.fn(),
				vi.fn(),
				vi.fn(),
			),
		});
		const token = await host.generate();
		const created = await host.handle({
			id: "req-create",
			token,
			method: "session.create",
		});
		if (!created.ok || created.method !== "session.create") {
			throw new Error("expected session.create");
		}
		await host.handle({
			id: "req-run",
			token,
			sessionId: created.result.id,
			method: "run_js",
			params: { code: "1 + 1" },
		});
		const loaded = await ctrl.loadForSession(created.result.id);
		expect(loaded?.trace.some((entry) => entry.toolName === "run_js")).toBe(
			true,
		);
		expect(loaded?.trace.some((entry) => entry.result?.includes("2"))).toBe(
			true,
		);
	});

	test("CLI file_write is persisted on the CLI session as a trace", async () => {
		const { ctrl } = await initBoundController(storage);
		const host = new EnrollmentHost({
			storage,
			sessions: ctrl,
			tools: createAgentTools(
				vi.fn(),
				vi.fn(),
				vi.fn(),
				async (op) => {
					if (op.op === "write") return { op: "write", bytes: op.content.length };
					throw new Error(`unexpected ${op.op}`);
				},
			),
		});
		const token = await host.generate();
		const created = await host.handle({
			id: "req-create",
			token,
			method: "session.create",
		});
		if (!created.ok || created.method !== "session.create") {
			throw new Error("expected session.create");
		}
		await host.handle({
			id: "req-write",
			token,
			sessionId: created.result.id,
			method: "file_write",
			params: { path: "/bridge-note.md", content: "from cli" },
		});
		const loaded = await ctrl.loadForSession(created.result.id);
		expect(
			loaded?.trace.some((entry) => entry.toolName === "file_write"),
		).toBe(true);
	});

	test("CLI get_doc is persisted on the CLI session as a trace", async () => {
		const { ctrl } = await initBoundController(storage);
		const host = new EnrollmentHost({
			storage,
			sessions: ctrl,
			tools: createAgentTools(
				vi.fn(),
				vi.fn().mockResolvedValue("### page.click"),
				vi.fn(),
				vi.fn(),
			),
		});
		const token = await host.generate();
		const created = await host.handle({
			id: "req-create",
			token,
			method: "session.create",
		});
		if (!created.ok || created.method !== "session.create") {
			throw new Error("expected session.create");
		}
		await host.handle({
			id: "req-docs",
			token,
			sessionId: created.result.id,
			method: "get_doc",
			params: { namespace: "page" },
		});
		const loaded = await ctrl.loadForSession(created.result.id);
		expect(loaded?.trace.some((entry) => entry.toolName === "get_doc")).toBe(
			true,
		);
	});
});
