import { describe, expect, test } from "vitest";
import { createSkillRegistryForFs } from "../../src/skills/skill-service";
import type { FsClient } from "../../src/skills/skill-types";

function makeFs(files: Record<string, string>): FsClient {
	const dirs = new Set<string>();
	for (const key of Object.keys(files)) {
		const parts = key.split("/").filter(Boolean);
		for (let i = 1; i < parts.length; i++) {
			dirs.add(`/${parts.slice(0, i).join("/")}`);
		}
	}
	return {
		async exists(path: string) {
			return { exists: path in files || dirs.has(path) };
		},
		async list(path: string) {
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
			const entries = [...names].map((name) => {
				const child = `${prefix}${name}`;
				const isDir =
					dirs.has(child) ||
					Object.keys(files).some((k) => k.startsWith(`${child}/`));
				return { name, kind: isDir ? "directory" : "file" };
			});
			return { entries };
		},
		async readText(path: string) {
			const content = files[path];
			if (content === undefined) throw new Error(`missing ${path}`);
			return { data: content };
		},
		async writeText() {
			return { ok: true as const };
		},
		async mkdir() {
			return { ok: true as const };
		},
		async delete() {
			return { ok: true as const };
		},
		async writeBase64() {
			return { path: "", bytes_written: 0 };
		},
		async readBase64() {
			return { data: "" };
		},
	};
}

describe("skill-registry", () => {
	test("user skill overrides bundled name", async () => {
		const fs = makeFs({
			"/skills/bundled/demo/SKILL.md":
				"---\nname: demo\ndescription: bundled\n---\nBundled",
			"/skills/user/demo/SKILL.md":
				"---\nname: demo\ndescription: user\n---\nUser",
		});
		const registry = createSkillRegistryForFs(fs);
		const { skills } = await registry.listSkills();
		expect(skills).toHaveLength(1);
		expect(skills[0]?.scope).toBe("user");
		expect(skills[0]?.description).toBe("user");
	});

	test("loadSkillResource reads under baseDir", async () => {
		const fs = makeFs({
			"/skills/bundled/demo/SKILL.md":
				"---\nname: demo\ndescription: d\n---\nBody",
			"/skills/bundled/demo/references/extra.md": "Extra content",
		});
		const registry = createSkillRegistryForFs(fs);
		const content = await registry.loadSkillResource(
			"demo",
			"references/extra.md",
		);
		expect(content).toBe("Extra content");
	});

	test('loadSkillBody("nonexistent") throws with useful message', async () => {
		const fs = makeFs({});
		const registry = createSkillRegistryForFs(fs);
		await expect(registry.loadSkillBody("nonexistent")).rejects.toThrow(
			"Unknown skill: nonexistent",
		);
	});

	test("skill with empty description is excluded from registry", async () => {
		const fs = makeFs({
			"/skills/bundled/empty/SKILL.md":
				"---\nname: empty\ndescription:\n---\nBody",
		});
		const registry = createSkillRegistryForFs(fs);
		const { skills } = await registry.listSkills();
		expect(skills).toHaveLength(0);
	});
});
