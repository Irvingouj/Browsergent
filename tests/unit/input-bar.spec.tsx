import { render } from "preact-render-to-string";
import { describe, expect, test, vi } from "vitest";
import { InputBar } from "../../src/sidepanel/components/InputBar";

const mockState = {
	ui: { taskDraft: "test task" },
};

vi.mock("zustand/react", () => ({
	useStore: (_store: unknown, selector: (state: unknown) => unknown) => {
		return selector(mockState);
	},
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
