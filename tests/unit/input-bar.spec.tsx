import { render } from "preact-render-to-string";
import { describe, expect, test, vi } from "vitest";
import {
	detectSlashState,
	InputBar,
	skillsToPickerItems,
} from "../../src/sidepanel/components/InputBar";
import type { SkillMeta } from "../../src/skills/skill-types";

const mockState = {
	ui: { taskDraft: "test task" },
};

vi.mock("zustand/react", () => ({
	useStore: (_store: unknown, selector: (state: unknown) => unknown) => {
		return selector(mockState);
	},
}));

vi.mock("../../src/skills/skill-service", () => ({
	getSkillService: () => ({
		subscribeSkillsChanged: vi.fn().mockReturnValue(() => {}),
		listSkills: vi.fn().mockResolvedValue([
			{
				name: "capability-check",
				description: "Probe",
				scope: "bundled",
				skillPath: "/skills/bundled/capability-check/SKILL.md",
				baseDir: "/skills/bundled/capability-check",
				disableModelInvocation: true,
				argumentNames: [],
			},
			{
				name: "fill-and-submit",
				description: "Fill form",
				scope: "bundled",
				skillPath: "/skills/bundled/fill-and-submit/SKILL.md",
				baseDir: "/skills/bundled/fill-and-submit",
				disableModelInvocation: false,
				argumentNames: ["email", "password"],
			},
		] satisfies SkillMeta[]),
	}),
}));

describe("InputBar", () => {
	test("shows Run button when not running", () => {
		const html = render(
			<InputBar isRunning={false} onRun={() => {}} onStop={() => {}} />,
		);
		expect(html).toContain("Run");
		expect(html).not.toContain("Stop");
		expect(html).toContain("test task");
	});

	test("shows Stop button when running", () => {
		const html = render(
			<InputBar isRunning={true} onRun={() => {}} onStop={() => {}} />,
		);
		expect(html).toContain("Stop");
		expect(html).not.toContain("Run");
	});

	test("disables input when running", () => {
		const html = render(
			<InputBar isRunning={true} onRun={() => {}} onStop={() => {}} />,
		);
		expect(html).toMatch(/disabled[ >]/);
	});

	test("does not disable input when not running", () => {
		const html = render(
			<InputBar isRunning={false} onRun={() => {}} onStop={() => {}} />,
		);
		expect(html).not.toMatch(/disabled[ >]/);
	});
});

describe("detectSlashState", () => {
	test("detects /skill: prefix at start", () => {
		expect(detectSlashState("/skill:cap", 12)).toEqual({
			start: 0,
			query: "skill:cap",
		});
	});

	test("returns null when slash is not at word boundary", () => {
		expect(detectSlashState("foo/bar", 7)).toBeNull();
	});

	test("returns null when token contains whitespace after slash", () => {
		expect(detectSlashState("/skill:cap rest", 12)).toBeNull();
	});
});

describe("skillsToPickerItems", () => {
	test("builds insertText with trailing space", () => {
		const items = skillsToPickerItems([
			{
				name: "capability-check",
				description: "Probe",
				scope: "bundled",
				skillPath: "/skills/bundled/capability-check/SKILL.md",
				baseDir: "/skills/bundled/capability-check",
				disableModelInvocation: true,
				argumentNames: [],
			},
		]);
		expect(items[0]?.insertText).toBe("/skill:capability-check ");
		expect(items[0]?.label).toBe("skill:capability-check");
	});
});
