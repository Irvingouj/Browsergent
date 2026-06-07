import { describe, expect, test } from "vitest";
import { render } from "preact-render-to-string";
import { TraceEntryCompact } from "../../src/sidepanel/components/TraceEntryCompact";
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
		expect(html).toContain("bg-accent-green/15");
	});

	test("renders error status with red icon", () => {
		const html = render(<TraceEntryCompact entry={makeEntry("error")} />);
		expect(html).toContain("run_js");
		expect(html).toContain("✗");
		expect(html).toContain("bg-accent-red/15");
	});

	test("renders running status with amber pulse icon", () => {
		const html = render(<TraceEntryCompact entry={makeEntry("running")} />);
		expect(html).toContain("run_js");
		expect(html).toContain("…");
		expect(html).toContain("bg-accent-amber/15");
		expect(html).toContain("animate-pulse-glow");
	});

	test("truncates long tool input when collapsed", () => {
		const entry = makeEntry("done");
		entry.toolInput = "x".repeat(100);
		const html = render(<TraceEntryCompact entry={entry} />);
		expect(html).toContain("x".repeat(60));
		expect(html).not.toContain("x".repeat(61));
	});

	test("shows tool input and result when expanded", () => {
		const entry = makeEntry("done");
		entry.result = "Result text";
		const html = render(<TraceEntryCompact entry={entry} />);
		expect(html).toContain("run_js");
		expect(html).toContain("#1");
	});
});
