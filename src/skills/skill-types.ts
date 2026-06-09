export type SkillScope = "bundled" | "user";

export interface SkillMeta {
	name: string;
	description: string;
	scope: SkillScope;
	skillPath: string;
	baseDir: string;
	disableModelInvocation: boolean;
	argumentNames: ReadonlyArray<string>;
}

export interface SkillDocument {
	meta: SkillMeta;
	body: string;
}

export interface SkillFsListEntry {
	name: string;
	kind: string;
}

export interface SkillFsClient {
	fsExists(path: string): Promise<boolean>;
	fsList(path: string): Promise<ReadonlyArray<SkillFsListEntry>>;
	fsReadText(path: string): Promise<string>;
	fsWriteText(path: string, data: string): Promise<void>;
	fsMkdir(path: string): Promise<void>;
}

export interface SeedManifest {
	version: string;
	files: ReadonlyArray<{ path: string; sha256: string }>;
}
