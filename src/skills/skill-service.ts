import { ExtensionJsClient } from "../sidepanel/extension-js-client";
import { browsergentStore } from "../state/store";
import { formatSkillCatalog } from "./format-skill-catalog";
import {
	parseSkillActivation,
	resolveTaskWithSkill,
} from "./resolve-skill-activations";
import { seedBundledSkills } from "./seed-bundled-skills";
import { assertSkillLoadAllowed } from "./skill-errors";
import type { SkillImportResult } from "./skill-import-controller";
import { SkillImportController } from "./skill-import-controller";
import { SkillRegistry } from "./skill-registry";
import type {
	FsClient,
	LoadSkillOptions,
	SkillDiagnostic,
	SkillMeta,
} from "./skill-types";

type SkillsChangedCallback = (skills: SkillMeta[]) => void;

export class SkillService {
	private registry: SkillRegistry | null = null;
	private skillImport: SkillImportController | null = null;
	private readyPromise: Promise<void> | null = null;
	private diagnostics: SkillDiagnostic[] = [];
	/** Cached catalog after first OPFS list; cleared on import/delete/notify. */
	private skillsCache: SkillMeta[] | null = null;
	/** Single-flight for concurrent listSkills while cache is cold. */
	private inflightList: Promise<SkillMeta[]> | null = null;
	private readonly subscribers = new Set<SkillsChangedCallback>();

	constructor(
		private readonly fsFactory: (() => Promise<FsClient>) | null = null,
	) {}

	/**
	 * Seed bundled skills (once) and open the registry. Does not list every
	 * SKILL.md — that happens on the first listSkills / load / resolve call.
	 */
	async ensureReady(): Promise<SkillRegistry> {
		if (this.registry) return this.registry;
		if (!this.readyPromise) {
			this.readyPromise = this.initInternal().catch((err: unknown) => {
				this.readyPromise = null;
				throw err;
			});
		}
		await this.readyPromise;
		if (!this.registry) {
			throw new Error("SkillService failed to initialize");
		}
		return this.registry;
	}

	private async initInternal(): Promise<void> {
		const client = this.fsFactory
			? await this.fsFactory()
			: await this.defaultFsClient();
		if (!this.fsFactory) {
			await seedBundledSkills(client);
		}
		this.registry = new SkillRegistry(client);
		this.skillImport = new SkillImportController(client);
	}

	private async defaultFsClient(): Promise<FsClient> {
		const client = ExtensionJsClient.getInstance();
		await client.init();
		return client;
	}

	private invalidateCache(): void {
		this.skillsCache = null;
	}

	private async listSkillsFromFs(): Promise<SkillMeta[]> {
		if (!this.registry) {
			throw new Error("SkillService failed to initialize");
		}
		if (this.inflightList) return this.inflightList;

		const registry = this.registry;
		this.inflightList = (async () => {
			try {
				const result = await registry.listSkills();
				this.skillsCache = result.skills;
				this.diagnostics = result.diagnostics;
				browsergentStore
					.getState()
					.skillsDiagnosticsChanged(this.diagnostics);
				return this.skillsCache;
			} finally {
				this.inflightList = null;
			}
		})();
		return this.inflightList;
	}

	getDiagnostics(): ReadonlyArray<SkillDiagnostic> {
		return this.diagnostics;
	}

	subscribeSkillsChanged(callback: SkillsChangedCallback): () => void {
		this.subscribers.add(callback);
		return () => {
			this.subscribers.delete(callback);
		};
	}

	/**
	 * Invalidate cache and re-list. No-op if skills were never initialized
	 * (next on-demand load will seed/list fresh).
	 */
	notifySkillsChanged(): void {
		if (!this.registry && !this.readyPromise) return;
		void this.refresh().catch((err: unknown) => {
			console.debug(
				"[skills] refresh after notify failed:",
				err instanceof Error ? err.message : String(err),
			);
		});
	}

	private emitSkillsChanged(skills: SkillMeta[]): void {
		for (const callback of this.subscribers) {
			callback(skills);
		}
	}

	async refresh(): Promise<SkillMeta[]> {
		await this.ensureReady();
		// Wait out any in-flight list so we don't let a stale fetch repopulate
		// the cache after this refresh invalidates it.
		if (this.inflightList) {
			await this.inflightList.catch(() => undefined);
		}
		this.invalidateCache();
		const skills = await this.listSkillsFromFs();
		this.emitSkillsChanged(skills);
		return skills;
	}

	/** List skills, seeding on first use and returning a memory cache thereafter. */
	async listSkills(): Promise<SkillMeta[]> {
		await this.ensureReady();
		if (this.skillsCache) return this.skillsCache;
		return this.listSkillsFromFs();
	}

	async formatCatalog(): Promise<string> {
		const skills = await this.listSkills();
		return formatSkillCatalog(skills);
	}

	async resolveRunTask(draft: string): Promise<{
		task: string;
		resolvedTask: string;
		skillCatalog: string;
		activatedSkills: string[];
	}> {
		const registry = await this.ensureReady();
		const skills = await this.listSkills();
		const skillCatalog = formatSkillCatalog(skills);
		const activation = parseSkillActivation(draft);
		const activatedSkills = activation ? [activation.skillName] : [];
		const { task, resolvedTask } = await resolveTaskWithSkill(
			draft,
			async (name) => {
				const meta = skills.find((s) => s.name === name);
				if (!meta) {
					throw new Error(`Unknown skill: ${name}`);
				}
				return registry.loadBodyFromMeta(meta);
			},
		);
		return { task, resolvedTask, skillCatalog, activatedSkills };
	}

	async loadSkill(
		skill: string,
		path?: string,
		options: LoadSkillOptions = { source: "tool" },
	): Promise<string> {
		const registry = await this.ensureReady();
		const skills = await this.listSkills();
		const meta = skills.find((s) => s.name === skill) ?? null;
		if (!meta) {
			throw new Error(`Unknown skill: ${skill}`);
		}

		assertSkillLoadAllowed(skill, meta.disableModelInvocation, options);

		if (path) {
			return registry.loadResourceFromMeta(meta, path);
		}
		const doc = await registry.loadBodyFromMeta(meta);
		return doc.body;
	}

	async importUserSkill(files: File[]): Promise<SkillImportResult> {
		await this.ensureReady();
		if (!this.skillImport) {
			throw new Error("SkillService not initialized");
		}
		const result = await this.skillImport.importSkill(files);
		// Await refresh so callers (and cache) see the new skill immediately.
		await this.refresh();
		return result;
	}

	async deleteUserSkill(name: string): Promise<void> {
		await this.ensureReady();
		if (!this.skillImport) {
			throw new Error("SkillService not initialized");
		}
		await this.skillImport.deleteSkill(name);
		await this.refresh();
	}
}

let skillServiceInstance: SkillService | null = null;

export function getSkillService(): SkillService {
	if (!skillServiceInstance) {
		skillServiceInstance = new SkillService();
	}
	return skillServiceInstance;
}

/** Test-only reset */
export function resetSkillServiceForTests(): void {
	skillServiceInstance = null;
}

export function notifySkillsChanged(): void {
	getSkillService().notifySkillsChanged();
}

export function createSkillRegistryForFs(fs: FsClient): SkillRegistry {
	return new SkillRegistry(fs);
}
