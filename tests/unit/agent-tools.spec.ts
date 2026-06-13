import { beforeEach, describe, expect, test, vi } from "vitest";
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
const mockLoadSkill = vi.fn();
const mockFileOp = vi.fn();

function makeTools(runJs = vi.fn()) {
	return createAgentTools(runJs, mockGetDocs, mockLoadSkill, mockFileOp);
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
		expect(result).toMatch(/requires a non-empty/);
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

describe("load_skill tool", () => {
	function getLoadSkillHandler(tools: ReturnType<typeof createAgentTools>) {
		const handler = tools.getHandler("load_skill");
		if (!handler) throw new Error("load_skill handler not found");
		return handler;
	}

	test("returns skill content", async () => {
		mockLoadSkill.mockResolvedValue("# Skill body");
		const tools = makeTools();
		const handler = getLoadSkillHandler(tools);
		const result = await handler({ skill: "capability-check" });
		expect(result).toBe("# Skill body");
		expect(mockLoadSkill).toHaveBeenCalledWith("capability-check", undefined);
	});

	test("returns error envelope for forbidden path", async () => {
		const tools = makeTools();
		const handler = getLoadSkillHandler(tools);
		const result = await handler({
			skill: "capability-check",
			path: "../secrets",
		});
		expect(isToolErrorEnvelope(result as string)).toBe(true);
	});

	test("returns E_SKILL_INVOCATION_FORBIDDEN for disable-model-invocation skill", async () => {
		mockLoadSkill.mockRejectedValue(
			new Error(
				"Skill capability-check cannot be used with load_skill due to disable-model-invocation",
			),
		);
		const tools = makeTools();
		const handler = getLoadSkillHandler(tools);
		const result = await handler({ skill: "capability-check" });
		expect(isToolErrorEnvelope(result as string)).toBe(true);
		const envelope = expectErrorEnvelope(result as string);
		expect(envelope.code).toBe("E_SKILL_INVOCATION_FORBIDDEN");
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

describe("file_list tool", () => {
	beforeEach(() => {
		mockFileOp.mockReset();
	});

	test("returns formatted list of files", async () => {
		mockFileOp.mockResolvedValue({
			op: "list",
			files: [
				{ id: "f1", name: "notes.md", size: 12, mime: "text/markdown", isText: true },
				{ id: "f2", name: "image.png", size: 100, mime: "image/png", isText: false },
			],
		});
		const tools = makeTools();
		const handler = tools.getHandler("file_list");
		if (!handler) throw new Error("file_list handler not found");
		const result = (await handler({})) as string;
		expect(result).toContain("name\tsize\tmime\tisText");
		expect(result).toContain("notes.md\t12\ttext/markdown\tyes");
		expect(result).toContain("image.png\t100\timage/png\tno");
	});

	test("returns 'No files in session' when empty", async () => {
		mockFileOp.mockResolvedValue({ op: "list", files: [] });
		const tools = makeTools();
		const handler = tools.getHandler("file_list");
		const result = (await handler({})) as string;
		expect(result).toBe("No files in session.");
	});

	test("passes prefix through to fileOp", async () => {
		mockFileOp.mockResolvedValue({ op: "list", files: [] });
		const tools = makeTools();
		const handler = tools.getHandler("file_list");
		await handler({ prefix: "notes" });
		expect(mockFileOp).toHaveBeenCalledWith({ op: "list", prefix: "notes" });
	});
});

describe("file_read tool", () => {
	beforeEach(() => {
		mockFileOp.mockReset();
	});

	test("returns content on success", async () => {
		mockFileOp.mockResolvedValue({
			op: "read",
			content: "hello world",
			bytes: 11,
			truncated: false,
		});
		const tools = makeTools();
		const handler = tools.getHandler("file_read");
		if (!handler) throw new Error("file_read handler not found");
		const result = (await handler({ path: "notes.md" })) as string;
		expect(result).toBe("hello world");
	});

	test("returns E_FILE_INVALID on empty path", async () => {
		const tools = makeTools();
		const handler = tools.getHandler("file_read");
		const result = (await handler({ path: "  " })) as string;
		expect(isToolErrorEnvelope(result)).toBe(true);
		const envelope = expectErrorEnvelope(result);
		expect(envelope.code).toBe("E_FILE_INVALID");
	});

	test("returns E_FILE_PATH_SCOPE on path traversal", async () => {
		const tools = makeTools();
		const handler = tools.getHandler("file_read");
		const result = (await handler({ path: "../etc/passwd" })) as string;
		expect(isToolErrorEnvelope(result)).toBe(true);
		const envelope = expectErrorEnvelope(result);
		expect(envelope.code).toBe("E_FILE_PATH_SCOPE");
	});

	test("returns E_FILE_NOT_FOUND when fileOp throws not found", async () => {
		mockFileOp.mockRejectedValue(new Error("File not found in session: x.md"));
		const tools = makeTools();
		const handler = tools.getHandler("file_read");
		const result = (await handler({ path: "x.md" })) as string;
		expect(isToolErrorEnvelope(result)).toBe(true);
		const envelope = expectErrorEnvelope(result);
		expect(envelope.code).toBe("E_FILE_NOT_FOUND");
	});

	test("returns E_FILE_PATH_SCOPE on backslash in path", async () => {
		const tools = makeTools();
		const handler = tools.getHandler("file_read");
		const result = (await handler({ path: "folder\\file.md" })) as string;
		expect(isToolErrorEnvelope(result)).toBe(true);
		const envelope = expectErrorEnvelope(result);
		expect(envelope.code).toBe("E_FILE_PATH_SCOPE");
		expect(mockFileOp).not.toHaveBeenCalled();
	});

	test("returns E_FILE_PATH_SCOPE on null byte in path", async () => {
		const tools = makeTools();
		const handler = tools.getHandler("file_read");
		const result = (await handler({ path: "evil\0.md" })) as string;
		expect(isToolErrorEnvelope(result)).toBe(true);
		const envelope = expectErrorEnvelope(result);
		expect(envelope.code).toBe("E_FILE_PATH_SCOPE");
		expect(mockFileOp).not.toHaveBeenCalled();
	});

	test("returns E_FILE_BINARY when fileOp throws not-text", async () => {
		mockFileOp.mockRejectedValue(new Error("File is not text: bad.md"));
		const tools = makeTools();
		const handler = tools.getHandler("file_read");
		const result = (await handler({ path: "bad.md" })) as string;
		expect(isToolErrorEnvelope(result)).toBe(true);
		const envelope = expectErrorEnvelope(result);
		expect(envelope.code).toBe("E_FILE_BINARY");
	});

	test("returns E_FILE_UNKNOWN on unrecognized error", async () => {
		mockFileOp.mockRejectedValue(new Error("disk exploded"));
		const tools = makeTools();
		const handler = tools.getHandler("file_read");
		const result = (await handler({ path: "x.md" })) as string;
		expect(isToolErrorEnvelope(result)).toBe(true);
		const envelope = expectErrorEnvelope(result);
		expect(envelope.code).toBe("E_FILE_UNKNOWN");
		expect(envelope.message).toContain("disk exploded");
	});
});

describe("file_edit tool", () => {
	beforeEach(() => {
		mockFileOp.mockReset();
	});

	test("returns formatted result on success", async () => {
		mockFileOp.mockResolvedValue({ op: "edit", occurrences: 1, bytes: 14 });
		const tools = makeTools();
		const handler = tools.getHandler("file_edit");
		if (!handler) throw new Error("file_edit handler not found");
		const result = (await handler({
			path: "notes.md",
			old_string: "world",
			new_string: "browser",
		})) as string;
		expect(result).toBe(
			"Edited notes.md: replaced 1 occurrence; file is now 14 bytes.",
		);
	});

	test("returns E_FILE_NOT_UNIQUE when old_string matches multiple times", async () => {
		mockFileOp.mockRejectedValue(new Error("old_string matches 2 times"));
		const tools = makeTools();
		const handler = tools.getHandler("file_edit");
		const result = (await handler({
			path: "notes.md",
			old_string: "a",
			new_string: "b",
		})) as string;
		expect(isToolErrorEnvelope(result)).toBe(true);
		const envelope = expectErrorEnvelope(result);
		expect(envelope.code).toBe("E_FILE_NOT_UNIQUE");
	});

	test("returns E_FILE_STRING_NOT_FOUND when old_string missing", async () => {
		mockFileOp.mockRejectedValue(new Error("old_string not found in file"));
		const tools = makeTools();
		const handler = tools.getHandler("file_edit");
		const result = (await handler({
			path: "notes.md",
			old_string: "x",
			new_string: "y",
		})) as string;
		expect(isToolErrorEnvelope(result)).toBe(true);
		const envelope = expectErrorEnvelope(result);
		expect(envelope.code).toBe("E_FILE_STRING_NOT_FOUND");
	});

	test("returns E_FILE_NO_CHANGE when old_string equals new_string", async () => {
		mockFileOp.mockRejectedValue(new Error("old_string and new_string must differ"));
		const tools = makeTools();
		const handler = tools.getHandler("file_edit");
		const result = (await handler({
			path: "notes.md",
			old_string: "a",
			new_string: "b",
		})) as string;
		expect(isToolErrorEnvelope(result)).toBe(true);
		const envelope = expectErrorEnvelope(result);
		expect(envelope.code).toBe("E_FILE_NO_CHANGE");
	});

	test("returns E_FILE_TOO_LARGE when edit exceeds max file size", async () => {
		mockFileOp.mockRejectedValue(new Error("Edit would exceed max file size"));
		const tools = makeTools();
		const handler = tools.getHandler("file_edit");
		const result = (await handler({
			path: "notes.md",
			old_string: "a",
			new_string: "b",
		})) as string;
		expect(isToolErrorEnvelope(result)).toBe(true);
		const envelope = expectErrorEnvelope(result);
		expect(envelope.code).toBe("E_FILE_TOO_LARGE");
	});

	test("returns E_FILE_PATH_SCOPE on null byte in path", async () => {
		const tools = makeTools();
		const handler = tools.getHandler("file_edit");
		const result = (await handler({
			path: "evil\0.md",
			old_string: "a",
			new_string: "b",
		})) as string;
		expect(isToolErrorEnvelope(result)).toBe(true);
		const envelope = expectErrorEnvelope(result);
		expect(envelope.code).toBe("E_FILE_PATH_SCOPE");
		expect(mockFileOp).not.toHaveBeenCalled();
	});
});

describe("file_delete tool", () => {
	beforeEach(() => {
		mockFileOp.mockReset();
	});

	test("returns success message", async () => {
		mockFileOp.mockResolvedValue({ op: "delete" });
		const tools = makeTools();
		const handler = tools.getHandler("file_delete");
		if (!handler) throw new Error("file_delete handler not found");
		const result = (await handler({ path: "notes.md" })) as string;
		expect(result).toBe("Deleted notes.md.");
	});

	test("returns E_FILE_INVALID on empty path", async () => {
		const tools = makeTools();
		const handler = tools.getHandler("file_delete");
		const result = (await handler({ path: "" })) as string;
		expect(isToolErrorEnvelope(result)).toBe(true);
		const envelope = expectErrorEnvelope(result);
		expect(envelope.code).toBe("E_FILE_INVALID");
	});

	test("returns E_FILE_PATH_SCOPE on backslash in path", async () => {
		const tools = makeTools();
		const handler = tools.getHandler("file_delete");
		const result = (await handler({ path: "folder\\file.md" })) as string;
		expect(isToolErrorEnvelope(result)).toBe(true);
		const envelope = expectErrorEnvelope(result);
		expect(envelope.code).toBe("E_FILE_PATH_SCOPE");
		expect(mockFileOp).not.toHaveBeenCalled();
	});

	test("returns E_FILE_PATH_SCOPE on null byte in path", async () => {
		const tools = makeTools();
		const handler = tools.getHandler("file_delete");
		const result = (await handler({ path: "evil\0.md" })) as string;
		expect(isToolErrorEnvelope(result)).toBe(true);
		const envelope = expectErrorEnvelope(result);
		expect(envelope.code).toBe("E_FILE_PATH_SCOPE");
		expect(mockFileOp).not.toHaveBeenCalled();
	});
});


describe("file_read truncation", () => {
	beforeEach(() => {
		mockFileOp.mockReset();
	});

	test("truncates content exceeding MAX_FILE_READ_CHARS with head+tail+marker", async () => {
		const huge = "A".repeat(50_001);
		mockFileOp.mockResolvedValue({
			op: "read",
			content: huge,
			bytes: 50_001,
			truncated: true,
		});
		const tools = makeTools();
		const handler = tools.getHandler("file_read");
		if (!handler) throw new Error("file_read handler not found");
		const result = (await handler({ path: "big.txt" })) as string;

		expect(result).toContain("[truncated — file is 50001 bytes]");
		expect(result).toContain("\n\n[truncated]\n\n");

		const marker = "\n\n[truncated]\n\n";
		const budget = 50_000 - marker.length;
		const expectedHead = Math.ceil(budget / 2);
		const expectedTail = budget - expectedHead;

		const prefix = `[truncated — file is 50001 bytes]\n\n`;
		expect(result.startsWith(prefix + "A".repeat(expectedHead))).toBe(true);
		expect(result.endsWith("A".repeat(expectedTail))).toBe(true);
		expect(result).not.toBe(huge);
	});

	test("does not truncate content at exactly MAX_FILE_READ_CHARS", async () => {
		const exact = "B".repeat(50_000);
		mockFileOp.mockResolvedValue({
			op: "read",
			content: exact,
			bytes: 50_000,
			truncated: false,
		});
		const tools = makeTools();
		const handler = tools.getHandler("file_read");
		if (!handler) throw new Error("file_read handler not found");
		const result = (await handler({ path: "exact.txt" })) as string;
		expect(result).toBe(exact);
		expect(result).not.toContain("[truncated]");
	});
});

describe("run_js file reference", () => {
	beforeEach(() => {
		mockFileOp.mockReset();
	});

	test("file only succeeds with file content as code", async () => {
		mockFileOp.mockResolvedValue({
			op: "read",
			content: "console.log('hi')",
			bytes: 17,
			truncated: false,
		});
		const runJs = vi.fn().mockResolvedValue({
			status: "ok",
			result: "ok",
			stdout: [],
			stderr: [],
		});
		const tools = makeTools(runJs);
		const handler = getRunJsHandler(tools);
		const result = await handler({ file: { name: "script.js" } });
		expect(mockFileOp).toHaveBeenCalledWith({ op: "read", path: "script.js" });
		expect(runJs).toHaveBeenCalledWith("console.log('hi')");
		expect(typeof result).toBe("string");
	});

	test("code only still works without calling fileOp", async () => {
		const runJs = vi.fn().mockResolvedValue({
			status: "ok",
			result: "ok",
			stdout: [],
			stderr: [],
		});
		const tools = makeTools(runJs);
		const handler = getRunJsHandler(tools);
		await handler({ code: "1+1" });
		expect(mockFileOp).not.toHaveBeenCalled();
		expect(runJs).toHaveBeenCalledWith("1+1");
	});

	test("both code and file returns E_JS_INVALID_INPUT", async () => {
		const runJs = vi.fn();
		const tools = makeTools(runJs);
		const handler = getRunJsHandler(tools);
		const result = await handler({
			code: "1+1",
			file: { name: "script.js" },
		}) as string;
		expect(isToolErrorEnvelope(result)).toBe(true);
		const envelope = expectErrorEnvelope(result);
		expect(envelope.code).toBe("E_JS_INVALID_INPUT");
		expect(runJs).not.toHaveBeenCalled();
		expect(mockFileOp).not.toHaveBeenCalled();
	});

	test("neither code nor file returns validation message", async () => {
		const runJs = vi.fn();
		const tools = makeTools(runJs);
		const handler = getRunJsHandler(tools);
		const result = await handler({});
		expect(result).toMatch(/requires a non-empty/);
		expect(runJs).not.toHaveBeenCalled();
	});

	test("file not found returns E_FILE_NOT_FOUND", async () => {
		mockFileOp.mockRejectedValue(new Error("File not found in session: missing.js"));
		const runJs = vi.fn();
		const tools = makeTools(runJs);
		const handler = getRunJsHandler(tools);
		const result = await handler({ file: { name: "missing.js" } }) as string;
		expect(isToolErrorEnvelope(result)).toBe(true);
		const envelope = expectErrorEnvelope(result);
		expect(envelope.code).toBe("E_FILE_NOT_FOUND");
		expect(runJs).not.toHaveBeenCalled();
	});

	test("binary file returns E_FILE_BINARY", async () => {
		mockFileOp.mockRejectedValue(new Error("File is not text: img.png"));
		const runJs = vi.fn();
		const tools = makeTools(runJs);
		const handler = getRunJsHandler(tools);
		const result = await handler({ file: { name: "img.png" } }) as string;
		expect(isToolErrorEnvelope(result)).toBe(true);
		const envelope = expectErrorEnvelope(result);
		expect(envelope.code).toBe("E_FILE_BINARY");
		expect(runJs).not.toHaveBeenCalled();
	});

	test("file path traversal rejected before fileOp call", async () => {
		const runJs = vi.fn();
		const tools = makeTools(runJs);
		const handler = getRunJsHandler(tools);
		const result = await handler({ file: { name: "../etc/passwd" } }) as string;
		expect(isToolErrorEnvelope(result)).toBe(true);
		const envelope = expectErrorEnvelope(result);
		expect(envelope.code).toBe("E_FILE_PATH_SCOPE");
		expect(mockFileOp).not.toHaveBeenCalled();
		expect(runJs).not.toHaveBeenCalled();
	});
});

