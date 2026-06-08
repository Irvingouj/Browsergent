import { describe, expect, test, vi } from "vitest";
import { createAgentTools } from "../../src/worker/agent-tools";
import {
	isToolErrorEnvelope,
	parseToolErrorEnvelope,
} from "../../src/worker/tool-error-result";

function getRunJsHandler(tools: ReturnType<typeof createAgentTools>) {
	const handler = tools.getHandler("run_js");
	if (!handler) throw new Error("run_js handler not found");
	return handler;
}

function getGetDocHandler(tools: ReturnType<typeof createAgentTools>) {
	const handler = tools.getHandler("get_doc");
	if (!handler) throw new Error("get_doc handler not found");
	return handler;
}

function expectErrorEnvelope(text: string) {
	const envelope = parseToolErrorEnvelope(text);
	if (!envelope) throw new Error("expected error envelope");
	return envelope;
}

const mockGetDocs = vi.fn();

function makeTools(runJs = vi.fn()) {
	return createAgentTools(runJs, mockGetDocs);
}

describe("run_js tool error handling", () => {
	test("returns error envelope on JS timeout", async () => {
		const runJs = vi
			.fn()
			.mockRejectedValue(new Error("JS relay timed out after 30000ms"));
		const tools = makeTools(runJs);
		const handler = getRunJsHandler(tools);
		const result = await handler({ code: "while(true){}" });
		expect(typeof result).toBe("string");
		expect(isToolErrorEnvelope(result as string)).toBe(true);
		const envelope = expectErrorEnvelope(result as string);
		expect(envelope.code).toBe("E_JS_TIMEOUT");
	});

	test("returns error envelope on JS runtime error", async () => {
		const runJs = vi
			.fn()
			.mockRejectedValue(
				new Error("[runtime error] line 5: undefined variable"),
			);
		const tools = makeTools(runJs);
		const handler = getRunJsHandler(tools);
		const result = await handler({ code: "bad code" });
		expect(isToolErrorEnvelope(result as string)).toBe(true);
		const envelope = expectErrorEnvelope(result as string);
		expect(envelope.code).toBe("E_JS_RUNTIME");
	});

	test("returns error envelope on JS compile error", async () => {
		const runJs = vi
			.fn()
			.mockRejectedValue(new Error("[compile error] line 1: syntax error"));
		const tools = makeTools(runJs);
		const handler = getRunJsHandler(tools);
		const result = await handler({ code: "bad code" });
		expect(isToolErrorEnvelope(result as string)).toBe(true);
		const envelope = expectErrorEnvelope(result as string);
		expect(envelope.code).toBe("E_JS_COMPILE");
	});

	test("returns normal result on success", async () => {
		const runJs = vi.fn().mockResolvedValue({
			status: "ok",
			result: "42",
			stdout: [],
			stderr: [],
		});
		const tools = makeTools(runJs);
		const handler = getRunJsHandler(tools);
		const result = await handler({ code: "1+1" });
		expect(typeof result).toBe("string");
		expect(isToolErrorEnvelope(result as string)).toBe(false);
	});

	test("returns validation message for empty code without calling runJs", async () => {
		const runJs = vi.fn();
		const tools = makeTools(runJs);
		const handler = getRunJsHandler(tools);
		const result = await handler({ code: "" });
		expect(result).toBe("run_js requires a non-empty 'code' string");
		expect(runJs).not.toHaveBeenCalled();
	});

	test("does not throw on JS errors — always returns a string", async () => {
		const runJs = vi.fn().mockRejectedValue(new Error("catastrophic failure"));
		const tools = makeTools(runJs);
		const handler = getRunJsHandler(tools);
		const result = await handler({ code: "code" });
		expect(typeof result).toBe("string");
	});
});

describe("run_js tool resolved-error path (status: err)", () => {
	test("compile error returns E_JS_COMPILE envelope", async () => {
		const runJs = vi.fn().mockResolvedValue({
			status: "err",
			error: { kind: "compile", message: "syntax error", line: 1 },
			stdout: [],
			stderr: [],
		});
		const tools = makeTools(runJs);
		const handler = getRunJsHandler(tools);
		const result = await handler({ code: "bad" });
		expect(isToolErrorEnvelope(result as string)).toBe(true);
		const envelope = expectErrorEnvelope(result as string);
		expect(envelope.code).toBe("E_JS_COMPILE");
	});

	test("fuel_exhausted error returns E_JS_TIMEOUT envelope", async () => {
		const runJs = vi.fn().mockResolvedValue({
			status: "err",
			error: { kind: "fuel_exhausted", message: "execution limit", line: null },
			stdout: [],
			stderr: [],
		});
		const tools = makeTools(runJs);
		const handler = getRunJsHandler(tools);
		const result = await handler({ code: "while(true){}" });
		expect(isToolErrorEnvelope(result as string)).toBe(true);
		const envelope = expectErrorEnvelope(result as string);
		expect(envelope.code).toBe("E_JS_TIMEOUT");
	});

	test("runtime error returns E_JS_RUNTIME envelope", async () => {
		const runJs = vi.fn().mockResolvedValue({
			status: "err",
			error: { kind: "runtime", message: "undefined variable", line: 5 },
			stdout: [],
			stderr: [],
		});
		const tools = makeTools(runJs);
		const handler = getRunJsHandler(tools);
		const result = await handler({ code: "bad" });
		expect(isToolErrorEnvelope(result as string)).toBe(true);
		const envelope = expectErrorEnvelope(result as string);
		expect(envelope.code).toBe("E_JS_RUNTIME");
	});

	test("internal error returns E_JS_RUNTIME envelope", async () => {
		const runJs = vi.fn().mockResolvedValue({
			status: "err",
			error: { kind: "internal", message: "internal failure" },
			stdout: [],
			stderr: [],
		});
		const tools = makeTools(runJs);
		const handler = getRunJsHandler(tools);
		const result = await handler({ code: "bad" });
		expect(isToolErrorEnvelope(result as string)).toBe(true);
		const envelope = expectErrorEnvelope(result as string);
		expect(envelope.code).toBe("E_JS_RUNTIME");
	});
});

describe("get_doc tool", () => {
	test("returns namespace index markdown with no args", async () => {
		mockGetDocs.mockResolvedValue(
			JSON.stringify([
				{
					namespace: "page",
					name: "snapshot",
					action: null,
					description: "Take a snapshot",
					params: [],
					returns: { js_type: "string", description: "snapshot text" },
				},
			]),
		);
		const tools = makeTools();
		const handler = getGetDocHandler(tools);
		const result = await handler({});
		expect(typeof result).toBe("string");
		expect(result).toContain("page");
		expect(result).toContain("snapshot");
	});

	test("returns filtered markdown for namespace", async () => {
		mockGetDocs.mockResolvedValue(
			JSON.stringify([
				{
					namespace: "page",
					name: "snapshot",
					action: null,
					description: "Take a snapshot",
					params: [],
					returns: { js_type: "string", description: "snapshot text" },
				},
				{
					namespace: "chrome",
					name: "tabs",
					action: null,
					description: "List tabs",
					params: [],
					returns: { js_type: "array", description: "tabs" },
				},
			]),
		);
		const tools = makeTools();
		const handler = getGetDocHandler(tools);
		const result = await handler({ namespace: "page" });
		expect(result).toContain("snapshot");
		expect(result).not.toContain("chrome.tabs");
	});

	test("returns JSON when format is json", async () => {
		mockGetDocs.mockResolvedValue(
			JSON.stringify([
				{
					namespace: "page",
					name: "snapshot",
					action: null,
					description: "Take a snapshot",
					params: [],
					returns: { js_type: "string", description: "snapshot text" },
				},
			]),
		);
		const tools = makeTools();
		const handler = getGetDocHandler(tools);
		const result = await handler({ format: "json" });
		expect(() => JSON.parse(result as string)).not.toThrow();
	});

	test("returns error envelope when getDocs throws", async () => {
		mockGetDocs.mockRejectedValue(new Error("docs generation failed"));
		const tools = makeTools();
		const handler = getGetDocHandler(tools);
		const result = await handler({});
		expect(isToolErrorEnvelope(result as string)).toBe(true);
		const envelope = expectErrorEnvelope(result as string);
		expect(envelope.code).toBe("E_JS_RUNTIME");
		expect(envelope.message).toContain("docs generation failed");
	});
});
