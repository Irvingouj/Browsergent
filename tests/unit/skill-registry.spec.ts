import { describe, expect, test } from "vitest";
import { createSkillRegistryForFs } from "../../src/skills/skill-service";
import type { SkillFsClient } from "../../src/skills/skill-types";

function makeFs(files: Record<string, string>): SkillFsClient {
	const dirs = new Set<string>();
	for (const key of Object.keys(files)) {
		const parts = key.split("/").filter(Boolean);
		for (let i = 1; i < parts.length; i++) {
			dirs.add(`/${parts.slice(0, i).join("/")}`);
		}
	}
	return {
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
			const content = files[path];
			if (content === undefined) throw new Error(`missing ${path}`);
			return content;
		},
		async fsWriteText() {},
		async fsMkdir() {},
		async fsDelete() {},
		async fsWriteBase64() {},
		async fsReadBase64() {
			return "";
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
