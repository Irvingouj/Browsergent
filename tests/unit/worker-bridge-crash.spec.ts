import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { browsergentStore } from "../../src/state/store";
import {
	appendStreamingDelta,
	finalizeAllStreamingSignals,
	getStreamingSignal,
	initStreamingSignal,
} from "../../src/state/streaming-signals";

describe("worker crash recovery", () => {
	beforeEach(() => {
		browsergentStore.getState().agentReset();
		// Clean up any lingering streaming signals
		finalizeAllStreamingSignals();
	});

	afterEach(() => {
		browsergentStore.getState().agentReset();
		finalizeAllStreamingSignals();
	});

	test("worker crash sets agent status to error with E_WORKER_CRASH", () => {
		browsergentStore.getState().agentRunRequested("run-1");
		expect(browsergentStore.getState().agent.status).toBe("loading");

		browsergentStore.getState().agentFailed({
			code: "E_WORKER_CRASH",
			message: "Worker error: test crash",
			source: "worker",
		});

		expect(browsergentStore.getState().agent.status).toBe("error");
		expect(browsergentStore.getState().agent.lastError?.code).toBe(
			"E_WORKER_CRASH",
		);
	});

	test("after crash + reset, store is in clean idle state", () => {
		browsergentStore.getState().agentRunRequested("run-1");
		browsergentStore.getState().agentStatusChanged("running");
		browsergentStore.getState().agentFailed({
			code: "E_WORKER_CRASH",
			message: "crash",
			source: "worker",
		});
		browsergentStore.getState().agentReset();

		expect(browsergentStore.getState().agent.status).toBe("idle");
		expect(browsergentStore.getState().agent.activeRunId).toBeUndefined();
		expect(browsergentStore.getState().agent.lastError).toBeUndefined();
	});

	test("after crash + reset, new run can start", () => {
		browsergentStore.getState().agentRunRequested("run-1");
		browsergentStore.getState().agentFailed({
			code: "E_WORKER_CRASH",
			message: "crash",
			source: "worker",
		});
		browsergentStore.getState().agentReset();
		browsergentStore.getState().agentRunRequested("run-2");

		expect(browsergentStore.getState().agent.activeRunId).toBe("run-2");
		expect(browsergentStore.getState().agent.status).toBe("loading");
	});

	test("streaming signals are finalized on crash", () => {
		initStreamingSignal("msg-1");
		appendStreamingDelta("msg-1", "partial text");
		expect(getStreamingSignal("msg-1")?.value).toBe("partial text");

		const finalized = finalizeAllStreamingSignals();
		expect(finalized).toHaveLength(1);
		expect(finalized[0].messageId).toBe("msg-1");
		expect(finalized[0].text).toBe("partial text");
		expect(getStreamingSignal("msg-1")).toBeUndefined();
	});
});
