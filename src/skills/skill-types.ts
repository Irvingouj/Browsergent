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
	fsDelete(path: string): Promise<void>;
}

export interface SeedManifest {
	version: string;
	files: ReadonlyArray<{ path: string; sha256: string }>;
}

export type SkillDiagnostic =
	| { kind: "validation"; path: string; message: string }
	| {
			kind: "collision";
			name: string;
			winnerPath: string;
			loserPath: string;
			winnerScope: SkillScope;
	  };

export interface SkillListResult {
	skills: SkillMeta[];
	diagnostics: SkillDiagnostic[];
}

export interface LoadSkillOptions {
	source: "compose" | "tool";
	activatedSkills?: ReadonlyArray<string>;
}
