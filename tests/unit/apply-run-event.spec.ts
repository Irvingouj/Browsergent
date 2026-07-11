import { describe, expect, test } from "vitest";
import {
	applyRunEvent,
	createSessionSnapshot,
} from "../../src/controllers/apply-run-event";

describe("applyRunEvent", () => {
	test("appends user and assistant messages", () => {
		const snapshot = createSessionSnapshot();
		applyRunEvent(snapshot, {
			type: "agentMessage",
			runId: "run-1",
			message: {
				kind: "user",
				id: "u1",
				text: "hello",
				timestamp: 1,
			},
		});
		applyRunEvent(snapshot, {
			type: "agentMessage",
			runId: "run-1",
			message: {
				kind: "assistant",
				id: "a1",
				text: "",
				timestamp: 2,
			},
		});
		expect(snapshot.messages).toHaveLength(2);
		expect(snapshot.messages[0]?.text).toBe("hello");
	});

	test("dedupes user messages by id (relay redelivery)", () => {
		const snapshot = createSessionSnapshot();
		const user = {
			type: "agentMessage" as const,
			runId: "run-1",
			message: {
				kind: "user" as const,
				id: "u1",
				text: "hello",
				timestamp: 1,
			},
		};
		applyRunEvent(snapshot, user);
		applyRunEvent(snapshot, user);
		applyRunEvent(snapshot, user);
		expect(snapshot.messages).toHaveLength(1);
	});

	test("accumulates streaming deltas into assistant message", () => {
		const snapshot = createSessionSnapshot();
		applyRunEvent(snapshot, {
			type: "agentTextDelta",
			runId: "run-1",
			messageId: "a1",
			text: "Hel",
		});
		applyRunEvent(snapshot, {
			type: "agentTextDelta",
			runId: "run-1",
			messageId: "a1",
			text: "lo",
		});
		applyRunEvent(snapshot, {
			type: "agentMessageEnd",
			runId: "run-1",
			messageId: "a1",
		});
		expect(snapshot.messages).toHaveLength(1);
		expect(snapshot.messages[0]?.text).toBe("Hello");
	});

	test("records trace and diagnostic events", () => {
		const snapshot = createSessionSnapshot();
		applyRunEvent(snapshot, {
			type: "agentTrace",
			runId: "run-1",
			entry: {
				id: "t1",
				timestamp: 1,
				kind: "tool_call",
				toolName: "run_js",
				status: "running",
			},
		});
		applyRunEvent(snapshot, {
			type: "agentDiagnostic",
			runId: "run-1",
			event: {
				kind: "provider_sse_event",
				timestamp: 2,
				data: "event: ping",
			},
		});
		expect(snapshot.trace).toHaveLength(1);
		expect(snapshot.diagnostics).toHaveLength(1);
	});
});
