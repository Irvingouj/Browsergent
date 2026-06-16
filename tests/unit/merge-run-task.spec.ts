import { describe, expect, test } from "vitest";
import {
	buildDisplayTask,
	extractSkillBlock,
	mergeSkillAndFileAttachments,
} from "../../src/sidepanel/merge-run-task";
import type { ResolvedAttachment } from "../../src/sidepanel/resolve-file-mentions";

const attachment: ResolvedAttachment = {
	fileId: "f1",
	displayName: "notes.md",
	content: "file body",
};

describe("extractSkillBlock", () => {
	test("splits skill block and user task remainder", () => {
		const resolved =
			'<skill name="cap" location="/p">Body</skill>\n\nUser task: do thing';
		expect(extractSkillBlock(resolved)).toEqual({
			skillBlock: '<skill name="cap" location="/p">Body</skill>',
			userTaskRemainder: "do thing",
		});
	});

	test("returns full text when no user task suffix", () => {
		const resolved = '<skill name="cap" location="/p">Body</skill>';
		expect(extractSkillBlock(resolved)).toEqual({
			skillBlock: resolved,
			userTaskRemainder: null,
		});
	});
});

describe("buildDisplayTask", () => {
	test("strips skill token and file mentions for chat display", () => {
		const task = "/skill:capability-check @[file:f1:notes.md] do thing";
		expect(buildDisplayTask(task)).toBe("do thing");
	});

	test("falls back to skill label when cleaned text is empty", () => {
		expect(buildDisplayTask("/skill:capability-check")).toBe(
			"Using skill: capability-check",
		);
	});

	test("falls back to attachment label when only file mentions remain", () => {
		expect(buildDisplayTask("@[file:f1:notes.md]")).toBe("Attached: notes.md");
	});

	test("combines skill and attachment labels when both present", () => {
		expect(
			buildDisplayTask("/skill:capability-check @[file:f1:notes.md]"),
		).toBe("Using skill: capability-check · Attached: notes.md");
	});
});

describe("mergeSkillAndFileAttachments", () => {
	test("merges attachments after skill block with cleaned user remainder", () => {
		const task = "/skill:capability-check @[file:f1:notes.md] do thing";
		const resolved =
			'<skill name="capability-check" location="/p">Body</skill>\n\nUser task: @[file:f1:notes.md] do thing';
		const result = mergeSkillAndFileAttachments(task, resolved, [attachment]);
		expect(result).toContain('<skill name="capability-check"');
		expect(result).toContain('<attachment name="notes.md" id="f1">');
		expect(result).toContain("User task: do thing");
		expect(result).not.toContain("@[file:");
	});

	test("skill only with attachments and no user remainder", () => {
		const task = "/skill:capability-check @[file:f1:notes.md]";
		const resolved =
			'<skill name="capability-check" location="/p">Body</skill>\n\nUser task: @[file:f1:notes.md]';
		const result = mergeSkillAndFileAttachments(task, resolved, [attachment]);
		expect(result).toContain('<skill name="capability-check"');
		expect(result).toContain('<attachment name="notes.md"');
		expect(result).not.toContain("User task:");
	});

	test("no skill activation uses buildTaskWithAttachments", () => {
		const task = "@[file:f1:notes.md] check page";
		const result = mergeSkillAndFileAttachments(task, task, [attachment]);
		expect(result).toContain('<attachment name="notes.md"');
		expect(result).toContain("User task: check page");
		expect(result).not.toContain("<skill");
	});

	test("returns resolvedTask unchanged when attachments empty", () => {
		const resolved = '<skill name="cap" location="/p">Body</skill>';
		expect(mergeSkillAndFileAttachments("/skill:cap", resolved, [])).toBe(
			resolved,
		);
	});
});
