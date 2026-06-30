import type { ExtensionJsClient } from "../sidepanel/extension-js-client";

export type SkillScope = "bundled" | "user";

export interface SkillMeta {
	name: string;
	description: string;
	scope: SkillScope;
	skillPath: string;
	baseDir: string;
	disableModelInvocation: boolean;
	argumentNames: ReadonlyArray<string>;
	match?: string;
}

export interface SkillDocument {
	meta: SkillMeta;
	body: string;
}

/** FS 能力契约:签名全部 Pick 自 ExtensionJsClient,无手写。 */
export type FsClient = Pick<
	ExtensionJsClient,
	| "exists"
	| "stat"
	| "list"
	| "readText"
	| "readBase64"
	| "writeText"
	| "writeBase64"
	| "mkdir"
	| "delete"
	| "move"
	| "copy"
>;

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
