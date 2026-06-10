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
