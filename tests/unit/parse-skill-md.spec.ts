import { describe, expect, test } from "vitest";
import { parseFrontmatter, parseArgumentNames } from "../../src/skills/parse-skill-md";

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

	test("no frontmatter returns empty frontmatter and trimmed body", () => {
		const raw = "# Title\n\nNo YAML here.";
		const parsed = parseFrontmatter(raw);
		expect(parsed.frontmatter).toEqual({});
		expect(parsed.body).toBe("# Title\n\nNo YAML here.");
	});

	test("empty description frontmatter parses but is not usable alone", () => {
		const raw = `---
name: empty-skill
description:
---

Body only`;
		const parsed = parseFrontmatter(raw);
		expect(parsed.frontmatter.name).toBe("empty-skill");
		expect(parsed.frontmatter.description).toBe("");
		expect(parsed.body).toBe("Body only");
	});
});
