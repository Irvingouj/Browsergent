import { render } from "preact-render-to-string";
import { describe, expect, test } from "vitest";
import { CompactionIndicator } from "../../src/sidepanel/components/CompactionIndicator";

describe("CompactionIndicator", () => {
	test("shows a spinner and the compaction label", () => {
		const html = render(<CompactionIndicator />);
		expect(html).toContain('data-testid="compaction-indicator"');
		expect(html).toContain("Compacting context");
		expect(html).toContain("animate-spin");
		expect(html).toContain("compaction-ellipsis");
	});
});
