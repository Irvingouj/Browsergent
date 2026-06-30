import { beforeEach, describe, expect, test } from "vitest";
import { SkillService } from "../../src/skills/skill-service";
import type { FsClient, SkillMeta } from "../../src/skills/skill-types";

interface MockFs extends FsClient {
	storage: Map<string, string>;
}

function createMockFs(): MockFs {
	const storage = new Map<string, string>();
	return {
		storage,
		async exists(path: string): Promise<{ exists: boolean }> {
			return { exists: storage.has(path) };
		},
		async list(
			path: string,
		): Promise<{ entries: { name: string; kind: string }[] }> {
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
		async writeText(
			path: string,
			data: string,
		): Promise<{ path: string; bytes_written: number }> {
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
