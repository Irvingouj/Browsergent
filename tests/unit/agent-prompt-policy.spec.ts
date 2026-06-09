import { describe, expect, test } from "vitest";
import { SYSTEM_PROMPT } from "../../src/worker/anthropic-prompts";
import { JS_TOOL_PROMPT } from "../../src/worker/js-tool-prompt";

describe("agent prompt policy", () => {
	test("requires verified claims and side effects", () => {
		expect(SYSTEM_PROMPT).toContain("Never claim an action succeeded");
		expect(SYSTEM_PROMPT).toContain("Verify side effects");
		expect(SYSTEM_PROMPT).toContain("Do not promise a capability");
	});

	test("bounds recovery instead of repeating speculative calls", () => {
		expect(SYSTEM_PROMPT).toContain("Do not repeat the same failed approach");
		expect(SYSTEM_PROMPT).toContain("two distinct recovery approaches");
		expect(SYSTEM_PROMPT).toContain("state the limitation clearly");
	});

	test("preserves target identity across dynamic page changes", () => {
		expect(SYSTEM_PROMPT).toContain("Preserve target identity");
		expect(SYSTEM_PROMPT).toContain("stable URL, text, or other identifier");
	});

	test("documents binary and incomplete element-result limitations", () => {
		expect(JS_TOOL_PROMPT).toContain("`page.find()` results may omit DOM attributes");
		expect(JS_TOOL_PROMPT).toContain("`page.fetch()` returns a text body");
		expect(JS_TOOL_PROMPT).toContain("binary-safe API");
	});
});
