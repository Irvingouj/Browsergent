import { beforeEach, describe, expect, test, vi } from "vitest";
import { composeSystemPrompt } from "../../src/worker/anthropic-prompts";
import { createAgentTools } from "../../src/worker/agent-tools";
import type { CellResult } from "../../src/types/extjs-utils";

const mockGetDocs = vi.fn();
const mockLoadSkill = vi.fn();
const mockFileOp = vi.fn();

function makeTools(runJs = vi.fn()) {
	return createAgentTools(runJs, mockGetDocs, mockLoadSkill, mockFileOp);
}

function makeOkCell(text: string): CellResult {
	return {
		status: "ok",
		stdout: [text],
		stderr: [],
		result: null,
		execution_count: 0,
	};
}

describe("prefix cache: system prompt stability", () => {
	test("composeSystemPrompt contains no timestamp", () => {
		const prompt = composeSystemPrompt("");
		expect(prompt).not.toContain("Current date and time");
		expect(prompt).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
	});

	test("composeSystemPrompt is deterministic for same catalog", () => {
		const a = composeSystemPrompt("## available_skills\ncapability-check");
		const b = composeSystemPrompt("## available_skills\ncapability-check");
		expect(a).toBe(b);
	});

	test("composeSystemPrompt is stable across many calls", () => {
		const catalog = "## available_skills\nfoo, bar";
		const results = Array.from({ length: 10 }, () => composeSystemPrompt(catalog));
		expect(results.every((r) => r === results[0])).toBe(true);
	});

	test("composeSystemPrompt appends catalog block only when provided", () => {
		const withCatalog = composeSystemPrompt("## available_skills\nfoo-skill");
		const withoutCatalog = composeSystemPrompt("");
		expect(withCatalog).toContain("foo-skill");
		expect(withoutCatalog).not.toContain("foo-skill");
		expect(withoutCatalog).toContain("Use load_skill");
	});
});

describe("prefix cache: tool results pass through without TS truncation", () => {
	beforeEach(() => {
		mockGetDocs.mockReset();
		mockLoadSkill.mockReset();
		mockFileOp.mockReset();
	});

	test("run_js returns full result without truncation marker", async () => {
		const huge = "x".repeat(60_000);
		const runJs = vi.fn().mockResolvedValue(makeOkCell(huge));
		const tools = makeTools(runJs);
		const handler = tools.getHandler("run_js");
		if (!handler) throw new Error("run_js handler not found");
		const result = (await handler({ code: "return 'x'.repeat(60000)" })) as string;
		expect(result.length).toBeGreaterThan(50_000);
		expect(result).not.toContain("[truncated");
		expect(result).not.toContain("... [truncated");
	});

	test("get_doc returns full docs without truncation marker", async () => {
		const entries = Array.from({ length: 2000 }, (_, i) => ({
			namespace: `ns${i}`,
			name: `fn${i}`,
			action: null,
			description: "x".repeat(120),
			params: [],
			returns: { js_type: "string", description: "result" },
		}));
		mockGetDocs.mockResolvedValue(JSON.stringify(entries));
		const tools = makeTools();
		const handler = tools.getHandler("get_doc");
		if (!handler) throw new Error("get_doc handler not found");
		const result = (await handler({})) as string;
		expect(result.length).toBeGreaterThan(50_000);
		expect(result).not.toContain("[truncated");
	});

	test("load_skill returns full skill body without truncation marker", async () => {
		const huge = "x".repeat(60_000);
		mockLoadSkill.mockResolvedValue(huge);
		const tools = makeTools();
		const handler = tools.getHandler("load_skill");
		if (!handler) throw new Error("load_skill handler not found");
		const result = (await handler({ skill: "big-skill" })) as string;
		expect(result).toBe(huge);
		expect(result).not.toContain("[truncated");
	});

	test("file_read returns full content without truncation prefix for oversized file", async () => {
		const huge = "A".repeat(60_000);
		mockFileOp.mockResolvedValue({
			op: "read",
			content: huge,
			bytes: 60_000,
		});
		const tools = makeTools();
		const handler = tools.getHandler("file_read");
		if (!handler) throw new Error("file_read handler not found");
		const result = (await handler({ path: "big.txt" })) as string;
		expect(result).toBe(huge);
		expect(result).not.toContain("[truncated");
		expect(result).not.toContain("[truncated — file is");
	});
});

describe("prefix cache: system prompt prefix is byte-stable", () => {
	test("composeSystemPrompt does not vary with wall clock", () => {
		const p1 = composeSystemPrompt("catalog-block");
		const p2 = composeSystemPrompt("catalog-block");
		expect(p1).toBe(p2);
		expect(p1.length).toBeGreaterThan(100);
	});

	test("composeSystemPrompt output starts with the static SYSTEM_PROMPT body", () => {
		const prompt = composeSystemPrompt("");
		expect(prompt.startsWith("You are Browsergent")).toBe(true);
	});
});