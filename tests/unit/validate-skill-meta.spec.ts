import { describe, expect, test } from "vitest";
import {
	escapeXmlAttr,
	escapeXmlText,
	validateSkillDescription,
	validateSkillName,
} from "../../src/skills/validate-skill-meta";

describe("validateSkillName", () => {
	test("accepts valid names", () => {
		expect(validateSkillName("capability-check")).toEqual([]);
	});

	test("rejects invalid characters", () => {
		expect(validateSkillName("Bad_Name").join(" ")).toContain(
			"name contains invalid characters",
		);
	});

	test("rejects consecutive hyphens", () => {
		expect(validateSkillName("skill--x")).toContain(
			"name must not contain consecutive hyphens",
		);
	});

	test("rejects leading hyphen", () => {
		expect(validateSkillName("-leading")).toContain(
			"name must not start or end with a hyphen",
		);
	});

	test("rejects oversized names", () => {
		expect(validateSkillName("a".repeat(65)).join(" ")).toContain(
			"name exceeds 64 characters",
		);
	});
});

describe("validateSkillDescription", () => {
	test("requires description", () => {
		expect(validateSkillDescription(undefined)).toContain(
			"description is required",
		);
	});
});

describe("escapeXmlText", () => {
	test("escapes XML-significant characters", () => {
		expect(escapeXmlText(`say "hi" <tag> & 'there'`)).toBe(
			"say &quot;hi&quot; &lt;tag&gt; &amp; &apos;there&apos;",
		);
	});
});

describe("escapeXmlAttr", () => {
	test("escapes XML-significant characters", () => {
		expect(escapeXmlAttr(`say "hi" <tag>`)).toBe(
			"say &quot;hi&quot; &lt;tag&gt;",
		);
	});
});
