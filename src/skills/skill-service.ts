import { formatSkillCatalog } from "./format-skill-catalog";
import {
	parseSkillActivation,
	resolveTaskWithSkill,
} from "./resolve-skill-activations";
import { seedBundledSkills } from "./seed-bundled-skills";
import { assertSkillLoadAllowed } from "./skill-errors";
import { SkillImportController } from "./skill-import-controller";
import type { SkillImportResult } from "./skill-import-controller";
import { SkillRegistry } from "./skill-registry";
import type {
	LoadSkillOptions,
	SkillDiagnostic,
	SkillFsClient,
	SkillMeta,
} from "./skill-types";
import { ExtensionJsClient } from "../sidepanel/extension-js-client";
import { browsergentStore } from "../state/store";

type SkillsChangedCallback = (skills: SkillMeta[]) => void;

export class SkillService {
	private registry: SkillRegistry | null = null;
	private skillImport: SkillImportController | null = null;
	private readyPromise: Promise<void> | null = null;
	private diagnostics: SkillDiagnostic[] = [];
	private readonly subscribers = new Set<SkillsChangedCallback>();

	constructor(
		private readonly fsFactory: (() => Promise<SkillFsClient>) | null = null,
	) {}

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
		await this.refreshDiagnostics();
	}

	private async defaultFsClient(): Promise<SkillFsClient> {
		const client = ExtensionJsClient.getInstance();
		await client.init();
		return client;
	}

	private async refreshDiagnostics(): Promise<void> {
		if (!this.registry) return;
		const result = await this.registry.listSkills();
		this.diagnostics = result.diagnostics;
		browsergentStore.getState().skillsDiagnosticsChanged(this.diagnostics);
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

	notifySkillsChanged(): void {
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
		const registry = await this.ensureReady();
		const { skills } = await registry.listSkills();
		await this.refreshDiagnostics();
		this.emitSkillsChanged(skills);
		return skills;
	}

	async listSkills(): Promise<SkillMeta[]> {
		const registry = await this.ensureReady();
		const { skills } = await registry.listSkills();
		return skills;
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
		const { skills } = await registry.listSkills();
		const skillCatalog = formatSkillCatalog(skills);
		const activation = parseSkillActivation(draft);
		const activatedSkills = activation ? [activation.skillName] : [];
		const { task, resolvedTask } = await resolveTaskWithSkill(
			draft,
			(name) => registry.loadSkillBody(name),
		);
		return { task, resolvedTask, skillCatalog, activatedSkills };
	}

	async loadSkill(
		skill: string,
		path?: string,
		options: LoadSkillOptions = { source: "tool" },
	): Promise<string> {
		const registry = await this.ensureReady();
		const meta = await registry.getSkill(skill);
		if (!meta) {
			throw new Error(`Unknown skill: ${skill}`);
		}

		assertSkillLoadAllowed(skill, meta.disableModelInvocation, options);

		if (path) {
			return registry.loadSkillResource(skill, path);
		}
		const doc = await registry.loadSkillBody(skill);
		return doc.body;
	}

	async importUserSkill(files: File[]): Promise<SkillImportResult> {
		if (!this.skillImport) {
			throw new Error("SkillService not initialized");
		}
		const result = await this.skillImport.importSkill(files);
		this.notifySkillsChanged();
		return result;
	}

	async deleteUserSkill(name: string): Promise<void> {
		if (!this.skillImport) {
			throw new Error("SkillService not initialized");
		}
		await this.skillImport.deleteSkill(name);
		this.notifySkillsChanged();
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

export function createSkillRegistryForFs(fs: SkillFsClient): SkillRegistry {
	return new SkillRegistry(fs);
}
