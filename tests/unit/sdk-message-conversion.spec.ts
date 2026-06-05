import { describe, expect, test } from "vitest";
import { sdkToWasmMessages } from "../../src/worker/sdk-message-conversion";
import { formatToolError } from "../../src/worker/tool-error-result";

describe("sdkToWasmMessages", () => {
	test("sets is_error=false for normal tool results", () => {
		const sdkMessages = [
			{
				role: "tool_result" as const,
				content: [{ type: "text" as const, text: "42" }],
				id: "m3",
				timestamp: 3,
				tool_call_id: "tc1",
			},
		];
		const result = sdkToWasmMessages(sdkMessages);
		expect(result).toHaveLength(1);
		expect(result[0].role).toBe("tool_result");
		expect(result[0].is_error).toBe(false);
	});

	test("sets is_error=true and replaces content when tool result is error envelope", () => {
		const envelope = formatToolError(
			"E_JS_TIMEOUT",
			"JS execution timed out",
			"Retry the same code",
		);
		const sdkMessages = [
			{
				role: "tool_result" as const,
				content: [{ type: "text" as const, text: envelope }],
				id: "m3",
				timestamp: 3,
				tool_call_id: "tc1",
			},
		];
		const result = sdkToWasmMessages(sdkMessages);
		expect(result[0].is_error).toBe(true);
		const textContent = result[0].content.find(
			(c: { type: string }) => c.type === "text",
		);
		expect((textContent as { type: "text"; text: string }).text).toBe(
			"[E_JS_TIMEOUT] JS execution timed out\nRecovery: Retry the same code",
		);
	});

	test("preserves user/assistant messages unchanged", () => {
		const sdkMessages = [
			{
				role: "user" as const,
				content: [{ type: "text" as const, text: "hello" }],
				id: "m1",
				timestamp: 1,
			},
			{
				role: "assistant" as const,
				content: [
					{
						type: "tool_call" as const,
						id: "tc1",
						name: "run_js",
						arguments: { code: "1+1" },
					},
				],
				id: "m2",
				timestamp: 2,
			},
		];
		const result = sdkToWasmMessages(sdkMessages);
		expect(result).toHaveLength(2);
		expect(result[0].role).toBe("user");
		expect(result[1].role).toBe("assistant");
	});
});
