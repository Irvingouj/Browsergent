export class SkillInvocationError extends Error {
	readonly code: string;

	constructor(code: string, message: string) {
		super(message);
		this.name = "SkillInvocationError";
		this.code = code;
	}
}

export function isSkillInvocationError(
	err: unknown,
): err is SkillInvocationError {
	return err instanceof SkillInvocationError;
}

export type SkillImportErrorCode =
	| "E_SKILL_NO_MANIFEST"
	| "E_SKILL_INVALID_META"
	| "E_SKILL_NAME_EMPTY";

export class SkillImportError extends Error {
	readonly code: SkillImportErrorCode;

	constructor(code: SkillImportErrorCode, message: string) {
		super(message);
		this.name = "SkillImportError";
		this.code = code;
	}
}

export function isSkillImportError(err: unknown): err is SkillImportError {
	return err instanceof SkillImportError;
}

export function assertSkillLoadAllowed(
	skillName: string,
	disableModelInvocation: boolean,
	options: {
		source: "compose" | "tool";
		activatedSkills?: ReadonlyArray<string>;
	},
): void {
	if (disableModelInvocation && options.source === "tool") {
		const activated = options.activatedSkills ?? [];
		if (!activated.includes(skillName)) {
			throw new SkillInvocationError(
				"E_SKILL_INVOCATION_FORBIDDEN",
				`Skill ${skillName} cannot be used with load_skill due to disable-model-invocation`,
			);
		}
	}
}
