import { formatSkillCatalog } from "./format-skill-catalog";
import { resolveTaskWithSkill } from "./resolve-skill-activations";
import { seedBundledSkills } from "./seed-bundled-skills";
import { SkillRegistry } from "./skill-registry";
import type { SkillFsClient, SkillMeta } from "./skill-types";
import { ExtensionJsClient } from "../sidepanel/extension-js-client";

export class SkillService {
	private registry: SkillRegistry | null = null;
	private readyPromise: Promise<void> | null = null;

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
		const client = ExtensionJsClient.getInstance();
		await client.init();
		await seedBundledSkills(client);
		this.registry = new SkillRegistry(client);
	}

	async listSkills(): Promise<SkillMeta[]> {
		const registry = await this.ensureReady();
		return registry.listSkills();
	}

	async formatCatalog(): Promise<string> {
		const skills = await this.listSkills();
		return formatSkillCatalog(skills);
	}

	async resolveRunTask(draft: string): Promise<{
		task: string;
		resolvedTask: string;
		skillCatalog: string;
	}> {
		const registry = await this.ensureReady();
		const skillCatalog = formatSkillCatalog(await registry.listSkills());
		const { task, resolvedTask } = await resolveTaskWithSkill(
			draft,
			(name) => registry.loadSkillBody(name),
		);
		return { task, resolvedTask, skillCatalog };
	}

	async loadSkill(skill: string, path?: string): Promise<string> {
		const registry = await this.ensureReady();
		if (path) {
			return registry.loadSkillResource(skill, path);
		}
		const doc = await registry.loadSkillBody(skill);
		return doc.body;
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

export function createSkillRegistryForFs(fs: SkillFsClient): SkillRegistry {
	return new SkillRegistry(fs);
}
