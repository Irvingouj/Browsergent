import { beforeEach, describe, expect, test, vi } from "vitest";
import { SkillService } from "../../src/skills/skill-service";
import type { FsClient } from "../../src/skills/skill-types";

interface MockFs extends FsClient {
	storage: Map<string, string>;
	listCalls: number;
	existsCalls: number;
	readTextCalls: number;
}

function createMockFs(): MockFs {
	const storage = new Map<string, string>();
	const fs: MockFs = {
		storage,
		listCalls: 0,
		existsCalls: 0,
		readTextCalls: 0,
		async exists(path: string): Promise<{ exists: boolean }> {
			fs.existsCalls += 1;
			if (storage.has(path)) return { exists: true };
			const prefix = path.endsWith("/") ? path : `${path}/`;
			for (const key of storage.keys()) {
				if (key.startsWith(prefix) || key === path) return { exists: true };
			}
			// Directory existence via prefix of any key
			for (const key of storage.keys()) {
				if (key.startsWith(`${path}/`)) return { exists: true };
			}
			return { exists: false };
		},
		async list(
			path: string,
		): Promise<{ entries: { name: string; kind: string }[] }> {
			fs.listCalls += 1;
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
			fs.readTextCalls += 1;
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
	return fs;
}

function putSkill(
	fs: MockFs,
	scope: "bundled" | "user",
	name: string,
	description = "A test skill",
	body = "Body content.",
): void {
	const dir = `/skills/${scope}/${name}`;
	const path = `${dir}/SKILL.md`;
	fs.storage.set(
		path,
		`---\nname: ${name}\ndescription: ${description}\n---\n${body}\n`,
	);
}

describe("SkillService lazy load + cache", () => {
	let fs: MockFs;
	let service: SkillService;

	beforeEach(() => {
		fs = createMockFs();
		putSkill(fs, "bundled", "demo", "Demo skill", "Do the demo.");
		service = new SkillService(() => Promise.resolve(fs));
	});

	test("constructing SkillService does not touch OPFS", () => {
		expect(fs.listCalls).toBe(0);
		expect(fs.existsCalls).toBe(0);
		expect(fs.readTextCalls).toBe(0);
	});

	test("ensureReady alone does not list skill dirs or read SKILL.md", async () => {
		await service.ensureReady();
		// With fsFactory, seed is skipped; registry is created with zero list.
		expect(fs.listCalls).toBe(0);
		expect(fs.readTextCalls).toBe(0);
	});

	test("first listSkills lists OPFS and returns skills", async () => {
		const skills = await service.listSkills();
		expect(skills.map((s) => s.name)).toEqual(["demo"]);
		expect(fs.listCalls).toBeGreaterThan(0);
	});

	test("second listSkills does not re-hit OPFS list", async () => {
		await service.listSkills();
		const listAfterFirst = fs.listCalls;
		const existsAfterFirst = fs.existsCalls;
		const readAfterFirst = fs.readTextCalls;

		const skills = await service.listSkills();
		expect(skills.map((s) => s.name)).toEqual(["demo"]);
		expect(fs.listCalls).toBe(listAfterFirst);
		expect(fs.existsCalls).toBe(existsAfterFirst);
		expect(fs.readTextCalls).toBe(readAfterFirst);
	});

	test("loadSkill uses cache for meta and only reads body file", async () => {
		await service.listSkills();
		const listAfter = fs.listCalls;
		const body = await service.loadSkill("demo", undefined, { source: "tool" });
		expect(body.trim()).toBe("Do the demo.");
		// No additional list of skill roots
		expect(fs.listCalls).toBe(listAfter);
		// One read for SKILL.md body
		expect(fs.readTextCalls).toBeGreaterThan(0);
	});

	test("refresh invalidates cache and re-lists", async () => {
		await service.listSkills();
		const listAfterFirst = fs.listCalls;
		putSkill(fs, "user", "new-skill", "New one", "New body.");
		const skills = await service.refresh();
		expect(skills.find((s) => s.name === "new-skill")).toBeTruthy();
		expect(fs.listCalls).toBeGreaterThan(listAfterFirst);
	});

	test("notifySkillsChanged before any ensureReady is a no-op (no OPFS)", () => {
		service.notifySkillsChanged();
		expect(fs.listCalls).toBe(0);
		expect(fs.existsCalls).toBe(0);
		expect(fs.readTextCalls).toBe(0);
	});

	test("notifySkillsChanged after ready invalidates and re-lists", async () => {
		await service.listSkills();
		const listAfterFirst = fs.listCalls;
		putSkill(fs, "user", "from-notify", "Notify skill");
		service.notifySkillsChanged();
		// refresh is async fire-and-forget
		await vi.waitFor(async () => {
			const skills = await service.listSkills();
			expect(skills.find((s) => s.name === "from-notify")).toBeTruthy();
		});
		expect(fs.listCalls).toBeGreaterThan(listAfterFirst);
	});

	test("importUserSkill works without prior ensureReady and updates cache", async () => {
		const content = `---\nname: imported\ndescription: From import\n---\nHi.\n`;
		const file = new File([content], "SKILL.md", { type: "text/markdown" });
		await service.importUserSkill([file]);
		const skills = await service.listSkills();
		expect(skills.find((s) => s.name === "imported")).toBeTruthy();
	});

	test("resolveRunTask builds catalog from cached list after warm", async () => {
		await service.listSkills();
		const listAfter = fs.listCalls;
		const result = await service.resolveRunTask("just a task");
		expect(result.skillCatalog).toContain("demo");
		expect(result.resolvedTask).toBe("just a task");
		expect(fs.listCalls).toBe(listAfter);
	});

	test("concurrent listSkills share one OPFS scan", async () => {
		const [a, b] = await Promise.all([
			service.listSkills(),
			service.listSkills(),
		]);
		expect(a).toEqual(b);
		// Two scopes (bundled + user) each list once — not doubled for concurrent callers
		const listCalls = fs.listCalls;
		await service.listSkills();
		expect(fs.listCalls).toBe(listCalls);
	});
});

describe("SkillService ensureReady seeds on production path", () => {
	test("default factory calls seedBundledSkills once on ensureReady", async () => {
		vi.resetModules();
		const seedMock = vi.fn().mockResolvedValue(undefined);
		vi.doMock("../../src/skills/seed-bundled-skills", () => ({
			seedBundledSkills: seedMock,
		}));

		const mockFs = {
			async exists() {
				return { exists: false };
			},
			async list() {
				return { entries: [] as { name: string; kind: string }[] };
			},
			async readText() {
				return { data: "" };
			},
			async writeText() {
				return { path: "", bytes_written: 0 };
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
			async init() {
				return undefined;
			},
		};

		vi.doMock("../../src/sidepanel/extension-js-client", () => ({
			ExtensionJsClient: {
				getInstance: () => mockFs,
			},
		}));

		vi.doMock("../../src/state/store", () => ({
			browsergentStore: {
				getState: () => ({
					skillsDiagnosticsChanged: vi.fn(),
				}),
			},
		}));

		const { SkillService: FreshSkillService } = await import(
			"../../src/skills/skill-service"
		);
		const svc = new FreshSkillService(); // no fsFactory → seeds
		await svc.ensureReady();
		expect(seedMock).toHaveBeenCalledTimes(1);

		// ensureReady again does not re-seed
		await svc.ensureReady();
		expect(seedMock).toHaveBeenCalledTimes(1);

		// first listSkills still only one seed
		await svc.listSkills();
		expect(seedMock).toHaveBeenCalledTimes(1);

		vi.doUnmock("../../src/skills/seed-bundled-skills");
		vi.doUnmock("../../src/sidepanel/extension-js-client");
		vi.doUnmock("../../src/state/store");
		vi.resetModules();
	});
});
