import { describe, expect, test, vi } from "vitest";
import type { AgentTraceEntry } from "../../src/types/messages";

describe("createTraceSlice", () => {
	test("appends new entry when id is not found", async () => {
		const { createTraceSlice } = await import(
			"../../src/state/slices/trace-slice"
		);
		const set = vi.fn((fn) => {
			const state = { trace: { entries: [] } };
			return fn(state);
		});
		const slice = createTraceSlice(
			set as unknown as Parameters<typeof createTraceSlice>[0],
		);
		const entry: AgentTraceEntry = {
			id: "t1",
			step: 1,
			status: "running",
			toolName: "run_js",
			timestamp: 1,
		};
		slice.traceUpdated(entry);
		const result = set.mock.calls[0][0]({ trace: { entries: [] } });
		expect(result.trace.entries).toHaveLength(1);
		expect(result.trace.entries[0]).toEqual(entry);
	});

	test("updates existing entry by id", async () => {
		const { createTraceSlice } = await import(
			"../../src/state/slices/trace-slice"
		);
		const set = vi.fn((fn) => {
			const state = {
				trace: {
					entries: [
						{
							id: "t1",
							step: 1,
							status: "running",
							toolName: "run_js",
							timestamp: 1,
						},
					],
				},
			};
			return fn(state);
		});
		const slice = createTraceSlice(
			set as unknown as Parameters<typeof createTraceSlice>[0],
		);
		const updated: AgentTraceEntry = {
			id: "t1",
			step: 1,
			status: "done",
			toolName: "run_js",
			result: "success",
			timestamp: 2,
		};
		slice.traceUpdated(updated);
		const result = set.mock.calls[0][0]({
			trace: {
				entries: [
					{
						id: "t1",
						step: 1,
						status: "running",
						toolName: "run_js",
						timestamp: 1,
					},
				],
			},
		});
		expect(result.trace.entries).toHaveLength(1);
		expect(result.trace.entries[0].status).toBe("done");
		expect(result.trace.entries[0].result).toBe("success");
	});

	test("clearTrace resets entries to empty", async () => {
		const { createTraceSlice } = await import(
			"../../src/state/slices/trace-slice"
		);
		const set = vi.fn();
		const slice = createTraceSlice(
			set as unknown as Parameters<typeof createTraceSlice>[0],
		);
		slice.clearTrace();
		expect(set).toHaveBeenCalledWith({ trace: { entries: [] } });
	});

	test("hydrateTrace replaces all entries", async () => {
		const { createTraceSlice } = await import(
			"../../src/state/slices/trace-slice"
		);
		const set = vi.fn();
		const slice = createTraceSlice(
			set as unknown as Parameters<typeof createTraceSlice>[0],
		);
		const entries: AgentTraceEntry[] = [
			{ id: "t1", step: 1, status: "done", toolName: "run_js", timestamp: 1 },
		];
		slice.hydrateTrace(entries);
		expect(set).toHaveBeenCalledWith({ trace: { entries } });
	});
});
