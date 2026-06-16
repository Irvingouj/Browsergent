import {
	parseSkillActivation,
	stripSkillToken,
} from "../skills/resolve-skill-activations";
import {
	buildAttachmentXmlBlock,
	buildTaskWithAttachments,
	parseFileMentions,
	type ResolvedAttachment,
	stripFileMentions,
} from "./resolve-file-mentions";

const USER_TASK_PREFIX = "\n\nUser task: ";

export function extractSkillBlock(resolvedTask: string): {
	skillBlock: string;
	userTaskRemainder: string | null;
} {
	const idx = resolvedTask.lastIndexOf(USER_TASK_PREFIX);
	if (idx === -1) {
		return { skillBlock: resolvedTask, userTaskRemainder: null };
	}
	return {
		skillBlock: resolvedTask.slice(0, idx),
		userTaskRemainder: resolvedTask.slice(idx + USER_TASK_PREFIX.length),
	};
}

export function buildDisplayTask(task: string): string {
	const cleaned = stripFileMentions(stripSkillToken(task)).trim();
	if (cleaned) return cleaned;

	const skill = parseSkillActivation(task);
	const mentions = parseFileMentions(task);
	const parts: string[] = [];
	if (skill) {
		parts.push(`Using skill: ${skill.skillName}`);
	}
	if (mentions.length > 0) {
		parts.push(`Attached: ${mentions.map((m) => m.displayName).join(", ")}`);
	}
	if (parts.length > 0) {
		return parts.join(" · ");
	}
	return task;
}

export function mergeSkillAndFileAttachments(
	task: string,
	resolvedTask: string,
	attachments: ResolvedAttachment[],
): string {
	if (attachments.length === 0) {
		return resolvedTask;
	}

	if (resolvedTask === task) {
		return buildTaskWithAttachments(task, attachments);
	}

	const { skillBlock } = extractSkillBlock(resolvedTask);
	const attachmentBlocks = attachments
		.map((a) => buildAttachmentXmlBlock(a.displayName, a.fileId, a.content))
		.join("\n\n");
	const userRemainder = stripFileMentions(stripSkillToken(task)).trim();

	const parts: string[] = [skillBlock];
	if (attachmentBlocks) {
		parts.push(attachmentBlocks);
	}
	if (userRemainder) {
		parts.push(`User task: ${userRemainder}`);
	}

	return parts.join("\n\n");
}
