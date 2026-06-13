import { describe, expect, test } from "vitest";
import { findSkillManifest } from "../../src/controllers/files-utils";

function makeFile(name: string, wrp?: string): File {
	const f = new File(["content"], name, { type: "text/plain" });
	if (wrp !== undefined) {
		Object.defineProperty(f, "webkitRelativePath", { value: wrp, writable: false });
	}
	return f;
}

describe("findSkillManifest", () => {
	test("returns file when name is exactly SKILL.md", () => {
		const skillMd = makeFile("SKILL.md");
		const other = makeFile("readme.txt");
		expect(findSkillManifest([other, skillMd])).toBe(skillMd);
	});

	test("returns file when webkitRelativePath ends with /SKILL.md", () => {
		const skillMd = makeFile("SKILL.md", "my-skill/SKILL.md");
		const other = makeFile("foo.md", "my-skill/references/foo.md");
		expect(findSkillManifest([other, skillMd])).toBe(skillMd);
	});

	test("returns null when no SKILL.md present", () => {
		const a = makeFile("readme.txt");
		const b = makeFile("config.json");
		expect(findSkillManifest([a, b])).toBeNull();
	});

	test("does not match files that merely contain SKILL.md in the name", () => {
		const fake = makeFile("not-SKILL.md");
		const fakeDir = makeFile("foo.md", "SKILL.md-backup/foo.md");
		expect(findSkillManifest([fake, fakeDir])).toBeNull();
	});

	test("prefers the first match when multiple SKILL.md files exist", () => {
		const first = makeFile("SKILL.md");
		const second = makeFile("SKILL.md", "other/SKILL.md");
		expect(findSkillManifest([first, second])).toBe(first);
	});

	test("returns null for empty array", () => {
		expect(findSkillManifest([])).toBeNull();
	});
});
