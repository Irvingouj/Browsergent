import { beforeEach, describe, expect, test } from "vitest";
import { SkillService } from "../../src/skills/skill-service";
import type { SkillFsClient, SkillMeta } from "../../src/skills/skill-types";

interface MockFs extends SkillFsClient {
	storage: Map<string, string>;
}

function createMockFs(): MockFs {
	const storage = new Map<string, string>();
	return {
		storage,
		async fsExists(path: string): Promise<boolean> {
			return storage.has(path);
		},
		async fsList(path: string): Promise<{ name: string; kind: string }[]> {
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
			return entries;
		},
		async fsReadText(path: string): Promise<string> {
			const data = storage.get(path);
			if (data === undefined) throw new Error(`Not found: ${path}`);
			return data;
		},
		async fsWriteText(path: string, data: string): Promise<void> {
			storage.set(path, data);
		},
		async fsMkdir(path: string): Promise<void> {
			if (!storage.has(path)) storage.set(path, "__DIR__");
		},
		async fsDelete(path: string): Promise<void> {
			storage.delete(path);
		},
		async fsWriteBase64(): Promise<void> {},
		async fsReadBase64(): Promise<string> {
			return "";
		},
	};
}

function makeSkillMd(name: string, description = "A test skill"): File {
	const content = `---\nname: ${name}\ndescription: ${description}\n---\nBody content.\n`;
	return new File([content], "SKILL.md", { type: "text/markdown" });
}

describe("SkillService.importUserSkill / deleteUserSkill", () => {
	let fs: MockFs;
	let service: SkillService;

	beforeEach(() => {
		fs = createMockFs();
		service = new SkillService(() => Promise.resolve(fs));
	});

	test("importUserSkill makes skill appear in listSkills", async () => {
		await service.ensureReady();

		await service.importUserSkill([makeSkillMd("my-skill")]);

		const skills = await service.listSkills();
		expect(skills.find((s) => s.name === "my-skill")).toBeTruthy();
	});

	test("deleteUserSkill removes skill from listSkills", async () => {
		await service.ensureReady();
		await service.importUserSkill([makeSkillMd("to-delete")]);

		const before = await service.listSkills();
		expect(before.find((s) => s.name === "to-delete")).toBeTruthy();

		await service.deleteUserSkill("to-delete");

		const after = await service.listSkills();
		expect(after.find((s) => s.name === "to-delete")).toBeFalsy();
	});

	test("importUserSkill notifies subscribers with updated skill list", async () => {
		await service.ensureReady();

		const notified = new Promise<SkillMeta[]>((resolve) => {
			service.subscribeSkillsChanged((skills) => resolve(skills));
		});

		await service.importUserSkill([makeSkillMd("notified-skill")]);
		const skills = await notified;

		expect(skills.find((s) => s.name === "notified-skill")).toBeTruthy();
	});

	test("concurrent refresh and listSkills do not interfere", async () => {
		await service.ensureReady();
		await service.importUserSkill([makeSkillMd("concurrent-skill")]);

		const [refreshResult, listResult] = await Promise.all([
			service.refresh(),
			service.listSkills(),
		]);

		expect(
			refreshResult.find((s) => s.name === "concurrent-skill"),
		).toBeTruthy();
		expect(listResult.find((s) => s.name === "concurrent-skill")).toBeTruthy();
	});
});
