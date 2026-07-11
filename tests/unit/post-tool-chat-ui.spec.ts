import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { SessionRunRegistry } from "../../src/controllers/session-run-registry";
import { WorkerBridge } from "../../src/controllers/worker-bridge";
import { browsergentStore } from "../../src/state/store";
import { getStreamingSignal } from "../../src/state/streaming-signals";

/**
 * Business bug: after run_js, worker streams final assistant text (logs show
 * agentloop.text_delta) but chat only shows the tool row and status stays
 * waiting_for_model.
 *
 * Regression vs v0.5.7: multi-window SessionRunRegistry gated UI updates and
 * could drop post-tool agentMessage/agentTextDelta even while activeRunId matched.
 */
describe("post-tool chat UI applies assistant text", () => {
	let postMessageSpy: ReturnType<typeof vi.fn>;
	let onmessage: ((ev: MessageEvent) => void) | null;

	beforeEach(() => {
		browsergentStore.getState().agentReset();
		browsergentStore.getState().clearChat();
		onmessage = null;
		postMessageSpy = vi.fn();
		const MockWorker = function MockWorker() {
			return {
				set onmessage(fn: ((ev: MessageEvent) => void) | null) {
					onmessage = fn;
				},
				get onmessage() {
					return onmessage;
				},
				onerror: null,
				postMessage: postMessageSpy,
				terminate: vi.fn(),
			};
		};
		vi.stubGlobal("Worker", vi.fn(MockWorker));
		vi.stubGlobal("chrome", {
			runtime: { getURL: vi.fn().mockReturnValue("/agent-worker.js") },
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	function deliver(data: unknown) {
		onmessage?.(new MessageEvent("message", { data }));
	}

	test("activeRunId paints text even when registry entry is headless", () => {
		const registry = new SessionRunRegistry();
		browsergentStore.getState().agentRunRequested("run-post-tool");
		registry.register("sess", "run-post-tool", "executing_tool");
		registry.detach("sess"); // would have blocked UI under old shouldUpdateUi

		expect(registry.shouldUpdateUi("run-post-tool")).toBe(true);

		const bridge = new WorkerBridge({
			runRouting: {
				shouldUpdateUi: (runId) => registry.shouldUpdateUi(runId),
			},
		});
		bridge.start();

		// Mid-run turn_end used to clear registry; simulate headless + text only.
		deliver({
			type: "agentTextDelta",
			runId: "run-post-tool",
			messageId: "asst-final",
			text: "I see 4 tabs.",
		});

		expect(browsergentStore.getState().chat.messageIds).toContain("asst-final");
		expect(
			browsergentStore.getState().chat.messagesById["asst-final"]?.text,
		).toBe("I see 4 tabs.");
		expect(browsergentStore.getState().agent.status).toBe("running");
		expect(getStreamingSignal("asst-final")?.value).toBe("I see 4 tabs.");
	});

	test("full post-tool sequence: tool status then final assistant stream", () => {
		const registry = new SessionRunRegistry();
		browsergentStore.getState().agentRunRequested("run-1");
		registry.register("sess", "run-1", "loading");

		const bridge = new WorkerBridge({
			runRouting: {
				shouldUpdateUi: (runId) => registry.shouldUpdateUi(runId),
			},
		});
		bridge.start();

		deliver({
			type: "agentStatus",
			runId: "run-1",
			status: "waiting_for_model",
			reason: "Calling model...",
		});
		deliver({
			type: "agentStatus",
			runId: "run-1",
			status: "executing_tool",
			reason: "Running run_js...",
		});
		// Intermediate completed → running (STATUS_MAP); must not wipe chat path.
		deliver({ type: "agentStatus", runId: "run-1", status: "running" });
		deliver({
			type: "agentMessage",
			runId: "run-1",
			message: {
				kind: "assistant",
				id: "a-final",
				text: "",
				timestamp: Date.now(),
			},
		});
		deliver({
			type: "agentTextDelta",
			runId: "run-1",
			messageId: "a-final",
			text: "There are ",
		});
		deliver({
			type: "agentTextDelta",
			runId: "run-1",
			messageId: "a-final",
			text: "4 open tabs.",
		});
		deliver({
			type: "agentMessageEnd",
			runId: "run-1",
			messageId: "a-final",
		});
		deliver({ type: "agentStatus", runId: "run-1", status: "done" });

		const msg = browsergentStore.getState().chat.messagesById["a-final"];
		expect(msg?.kind).toBe("assistant");
		expect(msg?.text).toBe("There are 4 open tabs.");
		expect(browsergentStore.getState().agent.status).toBe("done");
	});
});
