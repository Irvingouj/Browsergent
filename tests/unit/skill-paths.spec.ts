import { describe, expect, test } from "vitest";
import {
	isSafeSkillRelativePath,
	joinSkillResourcePath,
} from "../../src/skills/skill-paths";

describe("skill-paths", () => {
	test("isSafeSkillRelativePath rejects traversal and absolute paths", () => {
		expect(isSafeSkillRelativePath("..")).toBe(false);
		expect(isSafeSkillRelativePath("references/../secret.md")).toBe(false);
		expect(isSafeSkillRelativePath("/references/checklist.md")).toBe(false);
		expect(isSafeSkillRelativePath(".")).toBe(false);
		expect(isSafeSkillRelativePath("references/./checklist.md")).toBe(false);
		expect(isSafeSkillRelativePath("")).toBe(false);
	});

	test("isSafeSkillRelativePath accepts normal relative paths", () => {
		expect(isSafeSkillRelativePath("references/checklist.md")).toBe(true);
	});

	test("joinSkillResourcePath joins safe paths under baseDir", () => {
		expect(
			joinSkillResourcePath("/skills/bundled/demo", "references/checklist.md"),
		).toBe("/skills/bundled/demo/references/checklist.md");
	});

	test("joinSkillResourcePath throws for unsafe relative paths", () => {
		expect(() =>
			joinSkillResourcePath("/skills/bundled/demo", "../secret.md"),
		).toThrow("Invalid skill resource path: ../secret.md");
	});
});
