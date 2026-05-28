import { describe, expect, test } from "vitest";
import { browsergentStore } from "../../src/state/store";

describe("agent slice", () => {
	test("agentStatusChanged does not clobber lastError on error status", () => {
		const error = { code: "E_LLM_REQUEST", message: "API error" };

		browsergentStore.getState().agentFailed(error);
		expect(browsergentStore.getState().agent.lastError).toBe(error);

		browsergentStore.getState().agentStatusChanged("error", "API error");
		expect(browsergentStore.getState().agent.lastError).toBe(error);
	});

	test("agentStatusChanged clears lastError on non-error transitions", () => {
		const error = { code: "E_LLM_REQUEST", message: "API error" };

		browsergentStore.getState().agentFailed(error);
		expect(browsergentStore.getState().agent.lastError).toBe(error);

		browsergentStore.getState().agentStatusChanged("running");
		expect(browsergentStore.getState().agent.lastError).toBeUndefined();
	});

	test("agentReset clears lastError and statusReason", () => {
		browsergentStore.getState().agentFailed({
			code: "E_LLM_REQUEST",
			message: "API error",
		});
		expect(browsergentStore.getState().agent.lastError).toBeDefined();

		browsergentStore.getState().agentReset();
		expect(browsergentStore.getState().agent.lastError).toBeUndefined();
		expect(browsergentStore.getState().agent.statusReason).toBeUndefined();
	});

	test("agentRunRequested clears lastError and statusReason", () => {
		browsergentStore.getState().agentStopped("Stopped by user");
		expect(browsergentStore.getState().agent.statusReason).toBe(
			"Stopped by user",
		);
		browsergentStore.getState().agentFailed({
			code: "E_LLM_REQUEST",
			message: "API error",
		});

		browsergentStore.getState().agentRunRequested("new-run-id");
		expect(browsergentStore.getState().agent.lastError).toBeUndefined();
		expect(browsergentStore.getState().agent.statusReason).toBeUndefined();
	});
});
