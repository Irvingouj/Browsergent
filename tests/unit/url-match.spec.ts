import { describe, expect, test } from "vitest";
import type { SkillMeta } from "../../src/skills/skill-types";
import { globMatch, matchSkillsToUrl } from "../../src/skills/url-match";

function meta(match: string | undefined): SkillMeta {
	return {
		name: `skill-${match ?? "none"}`,
		description: "d",
		scope: "user",
		skillPath: "/x",
		baseDir: "/",
		disableModelInvocation: false,
		argumentNames: [],
		match,
	};
}

describe("globMatch", () => {
	test("matches an exact string case-insensitively", () => {
		expect(globMatch("example.com/jobs", "https://Example.com/jobs")).toBe(true);
	});

	test("matches * across path separators", () => {
		expect(
			globMatch("linkedin.com/jobs/search*", "https://www.linkedin.com/jobs/search/?keywords=rust"),
		).toBe(true);
	});

	test("matches subdomain wildcards", () => {
		expect(globMatch("*.linkedin.com/*", "https://www.linkedin.com/jobs")).toBe(true);
	});

	test("matches path-segment wildcards", () => {
		expect(globMatch("github.com/*/pull/*", "https://github.com/foo/bar/pull/123")).toBe(true);
	});
	test("matches when the pattern is a prefix of the url", () => {
		// Unanchored matching: "example.com/jobs" is a valid prefix and should hit.
		expect(globMatch("example.com/jobs", "https://example.com/jobs/extra")).toBe(true);
	});

	test("does not match the domain substring inside another host's path", () => {
		// Host-boundary anchor: "linkedin.com/*" must NOT hit evil.com/linkedin.com/x.
		expect(globMatch("linkedin.com/*", "https://evil.com/linkedin.com/x")).toBe(false);
		expect(globMatch("linkedin.com/*", "https://blog.example.com/post/linkedin.com/")).toBe(false);
	});

	test("does not match unrelated hosts", () => {
		expect(globMatch("linkedin.com/*", "https://github.com/foo")).toBe(false);
	});

	test("treats ? as exactly one character", () => {
		expect(globMatch("a?c", "abc")).toBe(true);
		expect(globMatch("a?c", "ac")).toBe(false);
		expect(globMatch("a?c", "abbc")).toBe(false);
	});

	test("escapes regex metacharacters in the pattern", () => {
		expect(globMatch("a.b/c", "axb/c")).toBe(false);
		expect(globMatch("a.b/c", "a.b/c")).toBe(true);
	});
});

describe("matchSkillsToUrl", () => {
	const skills = [meta("linkedin.com/jobs/*"), meta("github.com/*/pull/*"), meta(undefined)];

	test("returns only skills whose match glob hits the url", () => {
		const matched = matchSkillsToUrl(skills, "https://www.linkedin.com/jobs/search");
		expect(matched).toHaveLength(1);
		expect(matched[0]!.name).toBe("skill-linkedin.com/jobs/*");
	});

	test("matches multiple skills on the same url", () => {
		const both = [
			...matchSkillsToUrl(skills, "https://github.com/foo/bar/pull/1"),
		];
		expect(both).toHaveLength(1);
		expect(both[0]!.name).toBe("skill-github.com/*/pull/*");
	});

	test("skips skills without a match field", () => {
		const matched = matchSkillsToUrl(skills, "https://linkedin.com/jobs/x");
		expect(matched.every((s) => s.match !== undefined)).toBe(true);
	});

	test("returns empty when nothing matches", () => {
		expect(matchSkillsToUrl(skills, "https://example.com/")).toEqual([]);
	});
});
