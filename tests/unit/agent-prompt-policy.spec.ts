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
		expect(JS_TOOL_PROMPT).toContain(
			"`page.find()` results may omit DOM attributes",
		);
		expect(JS_TOOL_PROMPT).toContain("`page.fetch()` returns a text body");
		expect(JS_TOOL_PROMPT).toContain("binary-safe API");
	});

	test("documents file attachment tokens", () => {
		expect(JS_TOOL_PROMPT).toContain("@[file:");
		expect(JS_TOOL_PROMPT).toContain("<attachment");
	});

	test("encourages combining navigation with observation in one call", () => {
		expect(SYSTEM_PROMPT).toContain("Combine navigation with observation");
		expect(SYSTEM_PROMPT).toContain("always snapshot in the same run_js call");
		expect(JS_TOOL_PROMPT).toContain(
			"always call `page.snapshot()` in the same `run_js` block",
		);
	});

	test("documents single-use observation lease and receipt truthfulness", () => {
		expect(JS_TOOL_PROMPT).toContain("single-use");
		expect(JS_TOOL_PROMPT).toContain("dispatched: true");
		expect(JS_TOOL_PROMPT).toContain("E_OBSERVATION_REQUIRED");
		expect(SYSTEM_PROMPT).toContain("dispatch confirmations only");
		expect(SYSTEM_PROMPT).toContain("observation lease is invalidated");
	});
});
