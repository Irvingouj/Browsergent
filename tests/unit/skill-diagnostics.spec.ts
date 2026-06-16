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

describe("skill diagnostics", () => {
	test("user skill overriding bundled records collision diagnostic", async () => {
		const fs = makeFs({
			"/skills/bundled/demo/SKILL.md":
				"---\nname: demo\ndescription: bundled\n---\nBundled",
			"/skills/user/demo/SKILL.md":
				"---\nname: demo\ndescription: user copy\n---\nUser",
		});
		const registry = createSkillRegistryForFs(fs);
		const { skills, diagnostics } = await registry.listSkills();
		expect(skills).toHaveLength(1);
		expect(skills[0]?.scope).toBe("user");
		expect(diagnostics.some((d) => d.kind === "collision")).toBe(true);
	});

	test("empty description produces validation diagnostic and excludes skill", async () => {
		const fs = makeFs({
			"/skills/bundled/empty/SKILL.md":
				"---\nname: empty\ndescription:\n---\nBody",
		});
		const registry = createSkillRegistryForFs(fs);
		const { skills, diagnostics } = await registry.listSkills();
		expect(skills).toHaveLength(0);
		expect(
			diagnostics.some(
				(d) => d.kind === "validation" && d.message.includes("description"),
			),
		).toBe(true);
	});

	test("invalid name produces validation diagnostic", async () => {
		const fs = makeFs({
			"/skills/bundled/Bad_Name/SKILL.md":
				"---\nname: Bad_Name\ndescription: bad name skill\n---\nBody",
		});
		const registry = createSkillRegistryForFs(fs);
		const { skills, diagnostics } = await registry.listSkills();
		expect(skills).toHaveLength(0);
		expect(
			diagnostics.some(
				(d) =>
					d.kind === "validation" && d.message.includes("invalid characters"),
			),
		).toBe(true);
	});
});
