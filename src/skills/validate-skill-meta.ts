export const MAX_SKILL_NAME_LENGTH = 64;
export const MAX_SKILL_DESCRIPTION_LENGTH = 1024;

export function validateSkillName(name: string): string[] {
	const errors: string[] = [];

	if (name.length > MAX_SKILL_NAME_LENGTH) {
		errors.push(
			`name exceeds ${MAX_SKILL_NAME_LENGTH} characters (${name.length})`,
		);
	}

	if (!/^[a-z0-9-]+$/.test(name)) {
		errors.push(
			"name contains invalid characters (must be lowercase a-z, 0-9, hyphens only)",
		);
	}

	if (name.startsWith("-") || name.endsWith("-")) {
		errors.push("name must not start or end with a hyphen");
	}

	if (name.includes("--")) {
		errors.push("name must not contain consecutive hyphens");
	}

	return errors;
}

export function validateSkillDescription(description: string | undefined): string[] {
	const errors: string[] = [];

	if (!description || description.trim() === "") {
		errors.push("description is required");
	} else if (description.length > MAX_SKILL_DESCRIPTION_LENGTH) {
		errors.push(
			`description exceeds ${MAX_SKILL_DESCRIPTION_LENGTH} characters (${description.length})`,
		);
	}

	return errors;
}

export function escapeXmlText(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}

export function escapeXmlAttr(value: string): string {
	return escapeXmlText(value);
}
