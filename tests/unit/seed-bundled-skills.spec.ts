import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { seedBundledSkills } from "../../src/skills/seed-bundled-skills";
import { SKILLS_SEED_VERSION_PATH } from "../../src/skills/skill-paths";
import type { SkillFsClient } from "../../src/skills/skill-types";

function sha256(text: string): string {
	return createHash("sha256").update(text).digest("hex");
}

interface TrackingFs {
	fs: SkillFsClient;
	writes: Array<{ path: string; data: string }>;
	reads: string[];
	deletes: string[];
	files: Record<string, string>;
}

function makeTrackingFs(initial: Record<string, string> = {}): TrackingFs {
	const files = { ...initial };
	const dirs = new Set<string>();
	for (const key of Object.keys(files)) {
		const parts = key.split("/").filter(Boolean);
		for (let i = 1; i < parts.length; i++) {
			dirs.add(`/${parts.slice(0, i).join("/")}`);
		}
	}
	const writes: Array<{ path: string; data: string }> = [];
	const reads: string[] = [];
	const deletes: string[] = [];

	const fs: SkillFsClient = {
		async fsExists(path: string) {
			return path in files || dirs.has(path);
		},
		async fsList(path: string) {
			const prefix = path.endsWith("/") ? path : `${path}/`;
			const names = new Set<string>();
			for (const key of Object.keys(files)) {
				if (!key.startsWith(prefix)) continue;
				const rest = key.slice(prefix.length);
				const first = rest.split("/")[0];
				if (first) names.add(first);
			}
			for (const dir of dirs) {
				if (!dir.startsWith(prefix)) continue;
				const rest = dir.slice(prefix.length);
				const first = rest.split("/")[0];
				if (first) names.add(first);
			}
			return [...names].map((name) => {
				const child = `${prefix}${name}`;
				const isDir =
					dirs.has(child) ||
					Object.keys(files).some((k) => k.startsWith(`${child}/`));
				return { name, kind: isDir ? "directory" : "file" };
			});
		},
		async fsReadText(path: string) {
			reads.push(path);
			const content = files[path];
			if (content === undefined) throw new Error(`missing ${path}`);
			return content;
		},
		async fsWriteText(path: string, data: string) {
			writes.push({ path, data });
			files[path] = data;
			const parts = path.split("/").filter(Boolean);
			for (let i = 1; i < parts.length - 1; i++) {
				dirs.add(`/${parts.slice(0, i).join("/")}`);
			}
		},
		async fsMkdir(path: string) {
			dirs.add(path);
		},
		async fsDelete(path: string) {
			deletes.push(path);
			delete files[path];
			dirs.delete(path);
		},
	};

	return { fs, writes, reads, deletes, files };
}

function stubChromeAndFetch(
	responses: Record<string, string | { ok: false }>,
): void {
	vi.stubGlobal("chrome", {
		runtime: {
			getURL: (path: string) => `chrome-extension://test/${path}`,
		},
	});

	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string) => {
			const key = url.replace("chrome-extension://test/", "");
			const body = responses[key];
			if (body === undefined || typeof body === "object") {
				return { ok: false, text: async () => "" };
			}
			return {
				ok: true,
				text: async () => body,
				json: async () => JSON.parse(body),
			};
		}),
	);
}

describe("seedBundledSkills", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	test("version match skips writes and only reads seed version", async () => {
		stubChromeAndFetch({
			"skills/seed-manifest.json": JSON.stringify({
				version: "1.0.0",
				files: [{ path: "/skills/bundled/demo/SKILL.md", sha256: "abc" }],
			}),
		});

		const { fs, writes, reads } = makeTrackingFs({
			[SKILLS_SEED_VERSION_PATH]: "1.0.0",
		});

		await seedBundledSkills(fs);

		expect(writes).toEqual([]);
		expect(reads).toEqual([SKILLS_SEED_VERSION_PATH]);
	});

	test("version mismatch writes all bundled manifest files", async () => {
		const skillContent = "---\nname: demo\ndescription: d\n---\nBody";
		const extraContent = "Extra content";
		stubChromeAndFetch({
			"skills/seed-manifest.json": JSON.stringify({
				version: "2.0.0",
				files: [
					{
						path: "/skills/bundled/demo/SKILL.md",
						sha256: sha256(skillContent),
					},
					{
						path: "/skills/bundled/demo/references/extra.md",
						sha256: sha256(extraContent),
					},
				],
			}),
			"skills/bundled/demo/SKILL.md": skillContent,
			"skills/bundled/demo/references/extra.md": extraContent,
		});

		const { fs, writes } = makeTrackingFs({
			[SKILLS_SEED_VERSION_PATH]: "1.0.0",
		});

		await seedBundledSkills(fs);

		expect(writes).toEqual([
			{ path: "/skills/bundled/demo/SKILL.md", data: skillContent },
			{
				path: "/skills/bundled/demo/references/extra.md",
				data: extraContent,
			},
			{ path: SKILLS_SEED_VERSION_PATH, data: "2.0.0" },
		]);
	});

	test("invalid manifest throws", async () => {
		stubChromeAndFetch({
			"skills/seed-manifest.json": JSON.stringify({ version: "1.0.0" }),
		});

		const { fs } = makeTrackingFs();

		await expect(seedBundledSkills(fs)).rejects.toThrow(
			"Invalid skills seed manifest",
		);
	});

	test("paths outside /skills/bundled/ are skipped", async () => {
		const skillContent = "bundled skill content";
		stubChromeAndFetch({
			"skills/seed-manifest.json": JSON.stringify({
				version: "2.0.0",
				files: [
					{
						path: "/skills/bundled/demo/SKILL.md",
						sha256: sha256(skillContent),
					},
					{ path: "/skills/user/evil/SKILL.md", sha256: "bad" },
					{ path: "/etc/passwd", sha256: "worse" },
				],
			}),
			"skills/bundled/demo/SKILL.md": skillContent,
		});

		const { fs, writes } = makeTrackingFs();

		await seedBundledSkills(fs);

		expect(writes).toEqual([
			{ path: "/skills/bundled/demo/SKILL.md", data: skillContent },
			{ path: SKILLS_SEED_VERSION_PATH, data: "2.0.0" },
		]);
	});

	test("digest mismatch throws and does not write files", async () => {
		const skillContent = "bundled skill content";
		stubChromeAndFetch({
			"skills/seed-manifest.json": JSON.stringify({
				version: "2.0.0",
				files: [
					{
						path: "/skills/bundled/demo/SKILL.md",
						sha256: "deadbeef",
					},
				],
			}),
			"skills/bundled/demo/SKILL.md": skillContent,
		});

		const { fs, writes } = makeTrackingFs();

		await expect(seedBundledSkills(fs)).rejects.toThrow(
			"Bundled skill digest mismatch",
		);
		expect(writes).toEqual([]);
	});

	test("removes retired bundled files on reseed", async () => {
		const skillContent = "new bundled skill";
		stubChromeAndFetch({
			"skills/seed-manifest.json": JSON.stringify({
				version: "2.0.0",
				files: [
					{
						path: "/skills/bundled/demo/SKILL.md",
						sha256: sha256(skillContent),
					},
				],
			}),
			"skills/bundled/demo/SKILL.md": skillContent,
		});

		const { fs, deletes, files } = makeTrackingFs({
			[SKILLS_SEED_VERSION_PATH]: "1.0.0",
			"/skills/bundled/retired/SKILL.md": "old skill",
			"/skills/user/custom/SKILL.md": "user skill",
		});

		await seedBundledSkills(fs);

		expect(deletes).toContain("/skills/bundled/retired/SKILL.md");
		expect(files["/skills/user/custom/SKILL.md"]).toBe("user skill");
	});
});
