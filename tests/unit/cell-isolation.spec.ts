import { describe, expect, test } from "vitest";
import { SYSTEM_PROMPT } from "../../src/worker/anthropic-prompts";
import { JS_TOOL_PROMPT } from "../../src/worker/js-tool-prompt";

describe("cell isolation prompt contract", () => {
	test("JS_TOOL_PROMPT contains isolation keywords", () => {
		expect(JS_TOOL_PROMPT).toContain("isolated async cell");
		expect(JS_TOOL_PROMPT).toContain("Top-level");
		expect(JS_TOOL_PROMPT).toContain("do NOT persist");
		expect(JS_TOOL_PROMPT).toContain("globalThis._bg");
		expect(JS_TOOL_PROMPT).toContain("Cross-call state");
		expect(JS_TOOL_PROMPT).toContain("last expression");
	});

	test("SYSTEM_PROMPT contains cell isolation reminder", () => {
		expect(SYSTEM_PROMPT).toContain("Cell isolation");
		expect(SYSTEM_PROMPT).toContain("isolated async cell");
		expect(SYSTEM_PROMPT).toContain("globalThis._bg");
	});
});
