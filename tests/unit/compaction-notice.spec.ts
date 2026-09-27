import { describe, expect, test } from "vitest";
import { formatCompactionNotice } from "../../src/worker/compaction-notice";

describe("formatCompactionNotice", () => {
	test("names the summary and hides the warning before the third compaction", () => {
		const text = formatCompactionNotice({
			summary: "Applied to two roles.",
			messageCount: 23,
			extractive: false,
			compactionNumber: 1,
		});
		expect(text.startsWith("Context compacted · 23 messages summarized")).toBe(
			true,
		);
		expect(text).toContain("Applied to two roles.");
		expect(text).not.toContain("starting a new session");
	});

	test("says when the summary is a local extract, and warns on the third compaction", () => {
		const text = formatCompactionNotice({
			summary: "no one password, no lawrance harvey",
			messageCount: 4,
			extractive: true,
			compactionNumber: 3,
		});
		expect(text).toContain("summary model unavailable — local extract used");
		expect(text).toContain("no one password, no lawrance harvey");
		expect(text).toContain("starting a new session");
	});
});
