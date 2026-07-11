import { describe, expect, test } from "vitest";
import { SessionRunRegistry } from "../../src/controllers/session-run-registry";
import { browsergentStore } from "../../src/state/store";
import { mapAgentSdkStatus, STATUS_MAP } from "../../src/worker/agent-loop";

/**
 * Regression: after run_js/tool batch, chat showed only the tool row and no
 * final assistant text, status stuck on waiting_for_model.
 *
 * Root cause: pi-host SDK emits status `completed` on every turn_end — including
 * after a tool batch *before* hostContinueTurn streams the next assistant
 * message. Mapping that to terminal `done` cleared SessionRunRegistry so
 * subsequent agentMessage/agentTextDelta were dropped by shouldUpdateUi.
 */
describe("post-tool assistant message regression", () => {
	test("SDK completed (mid-run turn_end) is NOT terminal done", () => {
		expect(STATUS_MAP.completed).toBe("running");
		expect(mapAgentSdkStatus("completed")).toBe("running");
		expect(mapAgentSdkStatus("running_tool")).toBe("executing_tool");
		expect(mapAgentSdkStatus("calling_model")).toBe("waiting_for_model");
	});

	test("shouldUpdateUi paints active run even if registry cleared or headless", () => {
		browsergentStore.getState().agentReset();
		browsergentStore.getState().agentRunRequested("run-tool-1");
		const registry = new SessionRunRegistry();
		registry.register("sess-a", "run-tool-1", "executing_tool");
		expect(registry.shouldUpdateUi("run-tool-1")).toBe(true);

		registry.detach("sess-a");
		expect(registry.shouldUpdateUi("run-tool-1")).toBe(true);

		registry.clear("sess-a");
		expect(registry.getByRunId("run-tool-1")).toBeUndefined();
		expect(registry.shouldUpdateUi("run-tool-1")).toBe(true);
		expect(registry.shouldUpdateUi("run-other")).toBe(false);
	});

	test("streaming assistant does not regress to waiting_for_model", () => {
		expect(
			mapAgentSdkStatus("calling_model", { streamingAssistant: true }),
		).toBe("running");
	});
});
