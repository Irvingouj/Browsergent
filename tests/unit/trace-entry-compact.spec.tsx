import { render } from "preact-render-to-string";
import { describe, expect, test } from "vitest";
import {
	ResultBody,
	TraceEntryCompact,
} from "../../src/sidepanel/components/TraceEntryCompact";
import type { AgentTraceEntry } from "../../src/types/messages";

function makeEntry(status: AgentTraceEntry["status"]): AgentTraceEntry {
	return {
		id: "t1",
		step: 1,
		status,
		toolName: "run_js",
		toolInput: '{"code":"page.snapshot()"}',
		result: "ok",
		timestamp: 0,
	};
}

describe("TraceEntryCompact", () => {
	test("renders done status with green icon", () => {
		const html = render(<TraceEntryCompact entry={makeEntry("done")} />);
		expect(html).toContain("run_js");
		expect(html).toContain("✓");
		expect(html).toContain("bg-success-soft");
	});

	test("renders error status with red icon", () => {
		const html = render(<TraceEntryCompact entry={makeEntry("error")} />);
		expect(html).toContain("run_js");
		expect(html).toContain("✗");
		expect(html).toContain("bg-danger-soft");
	});

	test("renders running status with spinner", () => {
		const html = render(<TraceEntryCompact entry={makeEntry("running")} />);
		expect(html).toContain("run_js");
		expect(html).toContain("bg-warning-soft");
		expect(html).toContain("animate-spin");
	});

	test("truncates long tool input when collapsed", () => {
		const entry = makeEntry("done");
		entry.toolInput = "x".repeat(100);
		const html = render(<TraceEntryCompact entry={entry} />);
		expect(html).toContain("x".repeat(60));
		expect(html).not.toContain("x".repeat(61));
	});

	test("renders collapsed header when result is present", () => {
		const entry = makeEntry("done");
		entry.result = "Result text";
		const html = render(<TraceEntryCompact entry={entry} />);
		expect(html).toContain("run_js");
		expect(html).toContain("#1");
	});

	test("extracts JS code preview from run_js input", () => {
		const html = render(<TraceEntryCompact entry={makeEntry("running")} />);
		expect(html).toContain("page.snapshot()");
		expect(html).not.toContain('{"code":"page.snapshot()"}');
	});

	test("shows JS preview in collapsed header for run_js", () => {
		const entry = makeEntry("done");
		entry.toolInput = '{"code":"const x = 1;"}';
		const html = render(<TraceEntryCompact entry={entry} />);
		expect(html).toContain("const x = 1;");
		expect(html).not.toContain('{"code":"const x = 1;"}');
	});

	test("shows raw text for non-js tools", () => {
		const entry = makeEntry("done");
		entry.toolName = "get_doc";
		entry.toolInput = "page docs";
		const html = render(<TraceEntryCompact entry={entry} />);
		expect(html).toContain("page docs");
		expect(html).not.toContain("trace-code-block");
	});

	test("omits preview when toolInput is undefined", () => {
		const entry = makeEntry("done");
		entry.toolInput = undefined;
		const html = render(<TraceEntryCompact entry={entry} />);
		expect(html).toContain("run_js");
		expect(html).not.toContain("page.snapshot()");
	});

	test("renders collapsed header when result and toolInput are undefined", () => {
		const entry = makeEntry("done");
		entry.result = undefined;
		entry.toolInput = undefined;
		const html = render(<TraceEntryCompact entry={entry} />);
		expect(html).toContain("run_js");
		expect(html).not.toContain("page.snapshot()");
	});

	test("renders envelope stack in collapsible details", () => {
		const text = JSON.stringify({
			_is_error: true,
			code: "E_JS_RUNTIME",
			message: "TypeError: foo is undefined",
			hint: "Check the variable before access",
			stack:
				"TypeError: foo is undefined\n    at baz (file.js:1:7)\n    at qux (file.js:2:5)",
		});
		const html = render(<ResultBody text={text} />);
		expect(html).toContain("[E_JS_RUNTIME] TypeError: foo is undefined");
		expect(html).toContain("Check the variable before access");
		expect(html).toContain("Recovery:");
		expect(html).toContain("<details");
		expect(html).toContain(">Stack</summary>");
		expect(html).toContain("at baz (file.js:1:7)");
	});

	test("omits stack section when envelope has no stack", () => {
		const text = JSON.stringify({
			_is_error: true,
			code: "E_JS_TIMEOUT",
			message: "timed out",
			hint: "retry",
		});
		const html = render(<ResultBody text={text} />);
		expect(html).toContain("[E_JS_TIMEOUT] timed out");
		expect(html).not.toContain("<details");
		expect(html).not.toContain(">Stack</summary>");
	});

	test("renders plain text when not an envelope", () => {
		const html = render(<ResultBody text="just normal output" />);
		expect(html).toContain("just normal output");
		expect(html).not.toContain("<details");
	});
});
