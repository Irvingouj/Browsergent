import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
	isStaleRunId,
	WorkerBridge,
} from "../../src/controllers/worker-bridge";
import { browsergentStore } from "../../src/state/store";
import { finalizeAllStreamingSignals } from "../../src/state/streaming-signals";

const notifySkillsChanged = vi.fn();

vi.mock("../../src/skills/skill-service", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../../src/skills/skill-service")>();
	return {
		...actual,
		notifySkillsChanged: () => notifySkillsChanged(),
	};
});

describe("isStaleRunId", () => {
	test("returns false for unknown runId", () => {
		expect(isStaleRunId("unknown", "run-1")).toBe(false);
		expect(isStaleRunId("unknown", undefined)).toBe(false);
	});

	test("returns true when activeRunId is undefined", () => {
		expect(isStaleRunId("run-1", undefined)).toBe(true);
	});

	test("returns true when runId differs from activeRunId", () => {
		expect(isStaleRunId("run-1", "run-2")).toBe(true);
	});

	test("returns false when runId matches activeRunId", () => {
		expect(isStaleRunId("run-1", "run-1")).toBe(false);
	});
});

describe("WorkerBridge", () => {
	let postMessageSpy: ReturnType<typeof vi.fn>;
	let terminateSpy: ReturnType<typeof vi.fn>;
	let workerConstructor: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		notifySkillsChanged.mockClear();
		browsergentStore.getState().agentReset();
		browsergentStore.getState().clearChat();
		browsergentStore.getState().clearTrace();
		browsergentStore.getState().clearDiagnostics();
		browsergentStore.getState().skillsDiagnosticsChanged([]);
		finalizeAllStreamingSignals();

		postMessageSpy = vi.fn();
		terminateSpy = vi.fn();
		const MockWorker = function MockWorker() {
			return {
				onmessage: null,
				onerror: null,
				postMessage: postMessageSpy,
				terminate: terminateSpy,
			};
		};
		workerConstructor = vi.fn(MockWorker);
		vi.stubGlobal("Worker", workerConstructor);
		vi.stubGlobal("chrome", {
			runtime: { getURL: vi.fn().mockReturnValue("/agent-worker.js") },
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	function getWorkerInstance(): {
		onmessage: ((e: MessageEvent) => void) | null;
		onerror: ((err: ErrorEvent) => void) | null;
	} {
		expect(workerConstructor).toHaveBeenCalled();
		return workerConstructor.mock.results[0].value;
	}

	test("start creates worker and wires onmessage/onerror", () => {
		const bridge = new WorkerBridge();
		bridge.start();
		expect(workerConstructor).toHaveBeenCalledWith("/agent-worker.js", {
			type: "module",
		});
		const worker = getWorkerInstance();
		expect(worker.onmessage).not.toBeNull();
		expect(worker.onerror).not.toBeNull();
	});

	test("post auto-starts worker if not started", () => {
		const bridge = new WorkerBridge();
		bridge.post({ type: "agentStop" });
		expect(workerConstructor).toHaveBeenCalled();
		expect(postMessageSpy).toHaveBeenCalledWith({ type: "agentStop" });
	});

	test("stop terminates worker", () => {
		const bridge = new WorkerBridge();
		bridge.start();
		bridge.stop();
		expect(terminateSpy).toHaveBeenCalled();
	});

	test("restart stops and starts", () => {
		const bridge = new WorkerBridge();
		bridge.start();
		bridge.restart();
		expect(terminateSpy).toHaveBeenCalled();
		expect(workerConstructor).toHaveBeenCalledTimes(2);
	});

	test("workerReady triggers onWorkerReady callback", () => {
		const readySpy = vi.fn();
		const bridge = new WorkerBridge({ onWorkerReady: readySpy });
		bridge.start();
		const worker = getWorkerInstance();
		worker.onmessage?.(
			new MessageEvent("message", { data: { type: "workerReady" } }),
		);
		expect(readySpy).toHaveBeenCalled();
	});

	test("agentStatus updates store when runId matches", () => {
		browsergentStore.getState().agentRunRequested("run-1");
		const bridge = new WorkerBridge();
		bridge.start();
		const worker = getWorkerInstance();
		worker.onmessage?.(
			new MessageEvent("message", {
				data: { type: "agentStatus", runId: "run-1", status: "running" },
			}),
		);
		expect(browsergentStore.getState().agent.status).toBe("running");
	});

	test("agentStatus is ignored for stale runId", () => {
		browsergentStore.getState().agentRunRequested("run-1");
		const bridge = new WorkerBridge();
		bridge.start();
		const worker = getWorkerInstance();
		worker.onmessage?.(
			new MessageEvent("message", {
				data: { type: "agentStatus", runId: "run-2", status: "done" },
			}),
		);
		expect(browsergentStore.getState().agent.status).toBe("loading");
	});

	test("agentStatus finalizes signals on terminal states", () => {
		browsergentStore.getState().agentRunRequested("run-1");
		const bridge = new WorkerBridge();
		bridge.start();
		const worker = getWorkerInstance();
		worker.onmessage?.(
			new MessageEvent("message", {
				data: { type: "agentStatus", runId: "run-1", status: "done" },
			}),
		);
		expect(browsergentStore.getState().agent.status).toBe("done");
	});

	test("agentStatus refreshes skills on terminal states", () => {
		browsergentStore.getState().agentRunRequested("run-1");
		const bridge = new WorkerBridge();
		bridge.start();
		const worker = getWorkerInstance();
		worker.onmessage?.(
			new MessageEvent("message", {
				data: { type: "agentStatus", runId: "run-1", status: "done" },
			}),
		);
		expect(notifySkillsChanged).toHaveBeenCalledTimes(1);
	});

	test("agentMessage appends user message", () => {
		browsergentStore.getState().agentRunRequested("run-1");
		const bridge = new WorkerBridge();
		bridge.start();
		const worker = getWorkerInstance();
		worker.onmessage?.(
			new MessageEvent("message", {
				data: {
					type: "agentMessage",
					runId: "run-1",
					message: { kind: "user", id: "u1", text: "hi", timestamp: 1 },
				},
			}),
		);
		expect(browsergentStore.getState().chat.messageIds).toContain("u1");
	});

	test("agentMessage appends assistant message and init streaming", () => {
		browsergentStore.getState().agentRunRequested("run-1");
		const bridge = new WorkerBridge();
		bridge.start();
		const worker = getWorkerInstance();
		worker.onmessage?.(
			new MessageEvent("message", {
				data: {
					type: "agentMessage",
					runId: "run-1",
					message: { kind: "assistant", id: "a1", text: "hello", timestamp: 1 },
				},
			}),
		);
		expect(browsergentStore.getState().chat.messageIds).toContain("a1");
	});

	test("agentMessage appends system message", () => {
		browsergentStore.getState().agentRunRequested("run-1");
		const bridge = new WorkerBridge();
		bridge.start();
		const worker = getWorkerInstance();
		worker.onmessage?.(
			new MessageEvent("message", {
				data: {
					type: "agentMessage",
					runId: "run-1",
					message: { kind: "system", id: "s1", text: "info", timestamp: 1 },
				},
			}),
		);
		expect(browsergentStore.getState().chat.messageIds).toContain("s1");
	});

	test("agentTextDelta appends delta to streaming signal", () => {
		browsergentStore.getState().agentRunRequested("run-1");
		const bridge = new WorkerBridge();
		bridge.start();
		const worker = getWorkerInstance();
		worker.onmessage?.(
			new MessageEvent("message", {
				data: {
					type: "agentMessage",
					runId: "run-1",
					message: { kind: "assistant", id: "a1", text: "", timestamp: 1 },
				},
			}),
		);
		worker.onmessage?.(
			new MessageEvent("message", {
				data: {
					type: "agentTextDelta",
					runId: "run-1",
					messageId: "a1",
					text: "world",
				},
			}),
		);
		expect(browsergentStore.getState().chat.messagesById["a1"].text).toBe("");
	});

	test("agentMessageEnd finalizes assistant message", () => {
		browsergentStore.getState().agentRunRequested("run-1");
		const bridge = new WorkerBridge();
		bridge.start();
		const worker = getWorkerInstance();
		worker.onmessage?.(
			new MessageEvent("message", {
				data: {
					type: "agentMessage",
					runId: "run-1",
					message: { kind: "assistant", id: "a1", text: "", timestamp: 1 },
				},
			}),
		);
		worker.onmessage?.(
			new MessageEvent("message", {
				data: { type: "agentMessageEnd", runId: "run-1", messageId: "a1" },
			}),
		);
		// finalizeAssistantMessage sets text to the streaming signal value (empty here)
		expect(browsergentStore.getState().chat.messagesById["a1"].text).toBe("");
	});

	test("agentTrace updates trace", () => {
		browsergentStore.getState().agentRunRequested("run-1");
		const bridge = new WorkerBridge();
		bridge.start();
		const worker = getWorkerInstance();
		const entry = {
			id: "t1",
			step: 1,
			status: "done" as const,
			toolName: "run_js",
			timestamp: 1,
		};
		worker.onmessage?.(
			new MessageEvent("message", {
				data: { type: "agentTrace", runId: "run-1", entry },
			}),
		);
		expect(browsergentStore.getState().trace.entries).toHaveLength(1);
		expect(browsergentStore.getState().trace.entries[0].id).toBe("t1");
	});

	test("agentDiagnostic updates hidden diagnostics only", () => {
		browsergentStore.getState().agentRunRequested("run-1");
		const bridge = new WorkerBridge();
		bridge.start();
		const worker = getWorkerInstance();
		const event = {
			kind: "model_response" as const,
			timestamp: 1,
			providerStopReason: "tool_use",
			sdkStopReason: "tool_call" as const,
			content: [],
		};
		worker.onmessage?.(
			new MessageEvent("message", {
				data: { type: "agentDiagnostic", runId: "run-1", event },
			}),
		);

		expect(browsergentStore.getState().diagnostics.events).toEqual([event]);
		expect(browsergentStore.getState().trace.entries).toEqual([]);
		expect(browsergentStore.getState().chat.messageIds).toEqual([]);
	});

	test("agentError stores error and appends system message", () => {
		browsergentStore.getState().agentRunRequested("run-1");
		const bridge = new WorkerBridge();
		bridge.start();
		const worker = getWorkerInstance();
		worker.onmessage?.(
			new MessageEvent("message", {
				data: {
					type: "agentError",
					runId: "run-1",
					error: { code: "E_LLM_REQUEST", message: "LLM failed", details: {} },
				},
			}),
		);
		expect(browsergentStore.getState().agent.status).toBe("error");
		expect(browsergentStore.getState().agent.lastError?.code).toBe(
			"E_LLM_REQUEST",
		);
	});

	test("extjsOutput appends to extjs output", () => {
		browsergentStore.getState().agentRunRequested("run-1");
		const bridge = new WorkerBridge();
		bridge.start();
		const worker = getWorkerInstance();
		worker.onmessage?.(
			new MessageEvent("message", {
				data: { type: "extjsOutput", id: "o1", output: "hello" },
			}),
		);
		expect(browsergentStore.getState().extjs.output).toBe("hello");
	});

	test("extjsError stores JS runtime error", () => {
		const bridge = new WorkerBridge();
		bridge.start();
		const worker = getWorkerInstance();
		worker.onmessage?.(
			new MessageEvent("message", {
				data: { type: "extjsError", id: "e1", error: "crash" },
			}),
		);
		expect(browsergentStore.getState().extjs.status).toBe("error");
		expect(browsergentStore.getState().extjs.lastError?.code).toBe(
			"E_JS_RUNTIME",
		);
	});

	test("extjsRunRequest triggers onExtjsRunRequest callback", () => {
		const runSpy = vi.fn();
		const bridge = new WorkerBridge({ onExtjsRunRequest: runSpy });
		bridge.start();
		const worker = getWorkerInstance();
		worker.onmessage?.(
			new MessageEvent("message", {
				data: { type: "extjsRunRequest", id: "req-1", code: "1+1" },
			}),
		);
		expect(runSpy).toHaveBeenCalledWith({
			type: "extjsRunRequest",
			id: "req-1",
			code: "1+1",
		});
	});

	test("extjsDocsRequest triggers onExtjsDocsRequest callback", () => {
		const docsSpy = vi.fn();
		const bridge = new WorkerBridge({ onExtjsDocsRequest: docsSpy });
		bridge.start();
		const worker = getWorkerInstance();
		worker.onmessage?.(
			new MessageEvent("message", {
				data: { type: "extjsDocsRequest", id: "docs-1", format: "json" },
			}),
		);
		expect(docsSpy).toHaveBeenCalledWith({
			type: "extjsDocsRequest",
			id: "docs-1",
			format: "json",
		});
	});

	test("loadSkillRequest triggers onLoadSkillRequest callback", () => {
		const skillSpy = vi.fn();
		const bridge = new WorkerBridge({ onLoadSkillRequest: skillSpy });
		bridge.start();
		const worker = getWorkerInstance();
		worker.onmessage?.(
			new MessageEvent("message", {
				data: {
					type: "loadSkillRequest",
					id: "skill-1",
					skill: "capability-check",
					path: "references/checklist.md",
				},
			}),
		);
		expect(skillSpy).toHaveBeenCalledWith({
			type: "loadSkillRequest",
			id: "skill-1",
			skill: "capability-check",
			path: "references/checklist.md",
		});
	});

	test("loadSkillRequest is ignored when callback is not registered", () => {
		const bridge = new WorkerBridge();
		bridge.start();
		const worker = getWorkerInstance();
		expect(() =>
			worker.onmessage?.(
				new MessageEvent("message", {
					data: {
						type: "loadSkillRequest",
						id: "skill-1",
						skill: "capability-check",
					},
				}),
			),
		).not.toThrow();
	});

	test("invalid message appends system message", () => {
		const bridge = new WorkerBridge();
		bridge.start();
		const worker = getWorkerInstance();
		const beforeCount = browsergentStore.getState().chat.messageIds.length;
		worker.onmessage?.(
			new MessageEvent("message", {
				data: { type: "unknownType", runId: "run-1" },
			}),
		);
		expect(browsergentStore.getState().chat.messageIds.length).toBeGreaterThan(
			beforeCount,
		);
	});

	test("worker crash stores agent error and stops", () => {
		browsergentStore.getState().agentRunRequested("run-1");
		const bridge = new WorkerBridge();
		bridge.start();
		const worker = getWorkerInstance();
		const errorEvent = { message: "worker died" } as ErrorEvent;
		worker.onerror?.(errorEvent);
		expect(browsergentStore.getState().agent.status).toBe("error");
		expect(browsergentStore.getState().agent.lastError?.code).toBe(
			"E_WORKER_CRASH",
		);
	});
});
