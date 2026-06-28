import { beforeEach, describe, expect, test } from "vitest";
import { SkillImportController } from "../../src/skills/skill-import-controller";
import type { FsClient } from "../../src/skills/skill-types";

interface MockFs extends FsClient {
	storage: Map<string, string>;
}

function createMockFs(): MockFs {
	const storage = new Map<string, string>();
	return {
		storage,
		async exists(path: string): Promise<boolean> {
			return { exists: storage.has(path) };
		},
		async list(path: string): Promise<{ entries: { name: string; kind: string }[] }> {
			const entries: { name: string; kind: string }[] = [];
			const prefix = path.endsWith("/") ? path : `${path}/`;
			for (const [key, value] of storage.entries()) {
				if (value === "__DIR__") continue;
				if (!key.startsWith(prefix)) continue;
				const rest = key.slice(prefix.length);
				if (!rest) continue;
				const slashIdx = rest.indexOf("/");
				const name = slashIdx === -1 ? rest : rest.slice(0, slashIdx);
				const kind = slashIdx === -1 ? "file" : "directory";
				if (!entries.find((e) => e.name === name)) {
					entries.push({ name, kind });
				}
			}
			return { entries };
		},
		async readText(path: string): Promise<{ data: string }> {
			const data = storage.get(path);
			if (data === undefined) throw new Error(`Not found: ${path}`);
			return { data };
		},
		async writeText(path: string, data: string): Promise<{ path: string; bytes_written: number }> {
			storage.set(path, data);
			return { path, bytes_written: data.length };
		},
		async mkdir(path: string): Promise<{ ok: true }> {
			if (!storage.has(path)) storage.set(path, "__DIR__");
			return { ok: true };
		},
		async delete(path: string): Promise<{ ok: true }> {
			storage.delete(path);
			return { ok: true };
		},
		async writeBase64(): Promise<{ path: string; bytes_written: number }> {
			return { path: "", bytes_written: 0 };
		},
		async readBase64(): Promise<{ data: string }> {
			return { data: "" };
		},
	};
}

function makeSkillMd(name: string, description: string = "A test skill"): File {
	const content = `---\nname: ${name}\ndescription: ${description}\n---\nBody content here.\n`;
	return new File([content], "SKILL.md", { type: "text/markdown" });
}

function makeFile(name: string, content: string, wrp?: string): File {
	const f = new File([content], name, { type: "text/plain" });
	if (wrp !== undefined) {
		Object.defineProperty(f, "webkitRelativePath", {
			value: wrp,
			writable: false,
		});
	}
	return f;
}

describe("SkillImportController", () => {
	let fs: MockFs;
	let ctrl: SkillImportController;

	beforeEach(() => {
		fs = createMockFs();
		ctrl = new SkillImportController(fs);
	});

	test("imports single SKILL.md to /skills/user/{name}/SKILL.md", async () => {
		const skillMd = makeSkillMd("my-skill");
		const result = await ctrl.importSkill([skillMd]);

		expect(result.name).toBe("my-skill");
		expect(result.fileCount).toBe(1);
		expect(fs.storage.get("/skills/user/my-skill/SKILL.md")).toContain(
			"name: my-skill",
		);
	});

	test("parses name from frontmatter and sanitizes", async () => {
		const content =
			"---\nname:   my-skill  \ndescription: A skill\n---\nbody\n";
		const skillMd = new File([content], "SKILL.md", { type: "text/markdown" });
		const result = await ctrl.importSkill([skillMd]);

		expect(result.name).toBe("my-skill");
		expect(fs.storage.has("/skills/user/my-skill/SKILL.md")).toBe(true);
	});

	test("rejects upload without SKILL.md", async () => {
		const file = makeFile("readme.txt", "hello");
		await expect(ctrl.importSkill([file])).rejects.toMatchObject({
			code: "E_SKILL_NO_MANIFEST",
		});
	});

	test("rejects SKILL.md with missing name in frontmatter", async () => {
		const content = "---\ndescription: no name here\n---\nbody\n";
		const skillMd = new File([content], "SKILL.md", { type: "text/markdown" });
		await expect(ctrl.importSkill([skillMd])).rejects.toMatchObject({
			code: "E_SKILL_INVALID_META",
		});
	});

	test("rejects SKILL.md with unparseable YAML", async () => {
		const content = "---\nname: [invalid\n---\nbody\n";
		const skillMd = new File([content], "SKILL.md", { type: "text/markdown" });
		await expect(ctrl.importSkill([skillMd])).rejects.toThrow();
	});

	test("preserves folder structure from webkitRelativePath", async () => {
		const skillMd = makeFile(
			"SKILL.md",
			"---\nname: ref-skill\ndescription: has refs\n---\nbody\n",
			"ref-skill/SKILL.md",
		);
		const ref = makeFile(
			"foo.md",
			"reference content",
			"ref-skill/references/foo.md",
		);
		const result = await ctrl.importSkill([skillMd, ref]);

		expect(result.name).toBe("ref-skill");
		expect(result.fileCount).toBe(2);
		expect(fs.storage.get("/skills/user/ref-skill/SKILL.md")).toContain(
			"name: ref-skill",
		);
		expect(fs.storage.get("/skills/user/ref-skill/references/foo.md")).toBe(
			"reference content",
		);
	});

	test("flat fallback uses bare filename for non-folder upload", async () => {
		const skillMd = makeSkillMd("flat-skill");
		const extra = makeFile("extra.md", "extra content");
		const result = await ctrl.importSkill([skillMd, extra]);

		expect(result.fileCount).toBe(2);
		expect(fs.storage.get("/skills/user/flat-skill/extra.md")).toBe(
			"extra content",
		);
	});

	test("rejects path traversal in webkitRelativePath", async () => {
		const skillMd = makeSkillMd("traverse-skill");
		const evil = makeFile(
			"passwd",
			"root:x:0:0",
			"traverse-skill/../../etc/passwd",
		);
		const result = await ctrl.importSkill([skillMd, evil]);

		expect(result.warnings).toContainEqual(
			expect.stringContaining("skipped file with unsafe path"),
		);
		expect(result.fileCount).toBe(1);
	});

	test("skips binary files and includes in warnings", async () => {
		const skillMd = makeSkillMd("bin-skill");
		const png = makeFile("evil.png", "fakepng", "bin-skill/evil.png");
		const result = await ctrl.importSkill([skillMd, png]);

		expect(result.warnings).toContainEqual(
			expect.stringContaining("skipped binary file: evil.png"),
		);
		expect(result.fileCount).toBe(1);
	});

	test("overwrites existing skill with same name", async () => {
		fs.storage.set("/skills/user/overwrite-me/SKILL.md", "old content");
		const skillMd = makeSkillMd("overwrite-me");
		const result = await ctrl.importSkill([skillMd]);

		expect(result.fileCount).toBe(1);
		expect(fs.storage.get("/skills/user/overwrite-me/SKILL.md")).toContain(
			"name: overwrite-me",
		);
		expect(fs.storage.get("/skills/user/overwrite-me/SKILL.md")).not.toContain(
			"old content",
		);
	});

	test("deleteSkill removes the directory", async () => {
		fs.storage.set(
			"/skills/user/del-me/SKILL.md",
			"---\nname: del-me\n---\nbody\n",
		);
		fs.storage.set("/skills/user/del-me/refs.md", "reference");

		await ctrl.deleteSkill("del-me");

		expect(fs.storage.has("/skills/user/del-me/SKILL.md")).toBe(false);
		expect(fs.storage.has("/skills/user/del-me/refs.md")).toBe(false);
	});

	test("deleteSkill recursively removes nested files", async () => {
		fs.storage.set(
			"/skills/user/nested/SKILL.md",
			"---\nname: nested\n---\nbody\n",
		);
		fs.storage.set("/skills/user/nested/references/bar.md", "ref content");
		fs.storage.set("/skills/user/nested/scripts/baz.sh", "echo hi");

		await ctrl.deleteSkill("nested");

		expect(fs.storage.has("/skills/user/nested/SKILL.md")).toBe(false);
		expect(fs.storage.has("/skills/user/nested/references/bar.md")).toBe(false);
		expect(fs.storage.has("/skills/user/nested/scripts/baz.sh")).toBe(false);
	});

	test("deleteSkill on non-existent skill is a no-op", async () => {
		await expect(ctrl.deleteSkill("ghost")).resolves.toBeUndefined();
		expect(fs.storage.size).toBe(0);
	});

	test("dedupes files with same relative path without double-counting", async () => {
		const skillMd = makeSkillMd("dedupe-skill");
		const dup1 = makeFile("extra.md", "first content");
		const dup2 = makeFile("extra.md", "second content");
		const result = await ctrl.importSkill([skillMd, dup1, dup2]);

		expect(result.fileCount).toBe(2);
		expect(fs.storage.get("/skills/user/dedupe-skill/extra.md")).toBe(
			"second content",
		);
	});
});
