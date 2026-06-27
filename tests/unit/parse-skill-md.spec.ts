import { describe, expect, test } from "vitest";
import {
	parseArgumentNames,
	parseFrontmatter,
	SkillYamlParseError,
} from "../../src/skills/parse-skill-md";

describe("parse-skill-md", () => {
	test("parses frontmatter and body", () => {
		const raw = `---
name: test-skill
description: A test skill
disable-model-invocation: true
arguments: foo bar
---

# Body

Hello`;
		const parsed = parseFrontmatter(raw);
		expect(parsed.frontmatter.name).toBe("test-skill");
		expect(parsed.frontmatter.description).toBe("A test skill");
		expect(parsed.frontmatter["disable-model-invocation"]).toBe(true);
		expect(parseArgumentNames(parsed.frontmatter.arguments)).toEqual([
			"foo",
			"bar",
		]);
		expect(parsed.body).toContain("# Body");
	});

	test("parses match field", () => {
		const raw = `---
name: jobs-skill
description: A skill
match: linkedin.com/jobs/*
---

Body`;
		const parsed = parseFrontmatter(raw);
		expect(parsed.frontmatter.match).toBe("linkedin.com/jobs/*");
	});

	test("omits match field when absent", () => {
		const raw = `---
name: plain-skill
description: A skill
---

Body`;
		const parsed = parseFrontmatter(raw);
		expect(parsed.frontmatter.match).toBeUndefined();
	});

	test("parses YAML array arguments", () => {
		const raw = `---
name: array-skill
description: Array args
arguments:
  - foo
  - bar
---

Body`;
		const parsed = parseFrontmatter(raw);
		expect(parseArgumentNames(parsed.frontmatter.arguments)).toEqual([
			"foo",
			"bar",
		]);
	});

	test("parses multiline description", () => {
		const raw = `---
name: multi
description: |
  Line one
  Line two
---

Body`;
		const parsed = parseFrontmatter(raw);
		expect(parsed.frontmatter.description).toContain("Line one");
		expect(parsed.frontmatter.description).toContain("Line two");
	});

	test("parses quoted strings with escapes", () => {
		const raw = `---
name: quoted
description: "Say \\"hello\\""
---

Body`;
		const parsed = parseFrontmatter(raw);
		expect(parsed.frontmatter.description).toBe('Say "hello"');
	});

	test("parses inline comment after value", () => {
		const raw = `---
name: commented
description: A skill # not part of description
---

Body`;
		const parsed = parseFrontmatter(raw);
		expect(parsed.frontmatter.description).toBe("A skill");
	});

	test("no frontmatter returns empty frontmatter and trimmed body", () => {
		const raw = "# Title\n\nNo YAML here.";
		const parsed = parseFrontmatter(raw);
		expect(parsed.frontmatter).toEqual({});
		expect(parsed.body).toBe("# Title\n\nNo YAML here.");
	});

	test("malformed YAML throws SkillYamlParseError", () => {
		const raw = `---
name: [broken
description: bad
---

Body`;
		expect(() => parseFrontmatter(raw)).toThrow(SkillYamlParseError);
	});
});
