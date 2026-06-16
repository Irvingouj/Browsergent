import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { LoadSkillRelay } from "../../src/worker/load-skill-relay";

describe("LoadSkillRelay", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	test("posts loadSkillRequest when relay starts", async () => {
		const posted: Array<{
			id: string;
			skill: string;
			path?: string;
			activatedSkills?: string[];
		}> = [];
		const relay = new LoadSkillRelay((request) => {
			posted.push(request);
		}, 30_000);

		const promise = relay.relay("capability-check", "references/checklist.md", [
			"capability-check",
		]);
		expect(posted).toHaveLength(1);
		expect(posted[0]?.skill).toBe("capability-check");
		expect(posted[0]?.path).toBe("references/checklist.md");
		expect(posted[0]?.activatedSkills).toEqual(["capability-check"]);
		expect(posted[0]?.id).toMatch(/^load-skill-/);

		relay.resolve(posted[0]?.id ?? "", "# checklist");
		await expect(promise).resolves.toBe("# checklist");
	});

	test("rejects when relay times out", async () => {
		const relay = new LoadSkillRelay(() => {}, 1_000);
		const promise = relay.relay("capability-check");

		vi.advanceTimersByTime(1_000);
		await expect(promise).rejects.toThrow(
			"Load skill relay timed out after 1000ms",
		);
	});

	test("resolve clears pending and prevents timeout rejection", async () => {
		const relay = new LoadSkillRelay((request) => {
			relay.resolve(request.id, "body");
		}, 1_000);

		const promise = relay.relay("fill-and-submit");
		await expect(promise).resolves.toBe("body");

		vi.advanceTimersByTime(2_000);
	});

	test("reject clears pending with error message", async () => {
		const relay = new LoadSkillRelay((request) => {
			relay.reject(request.id, "not found");
		}, 30_000);

		const promise = relay.relay("missing-skill");
		await expect(promise).rejects.toThrow("not found");
	});

	test("rejectAll rejects all pending relays", async () => {
		const relay = new LoadSkillRelay(() => {}, 30_000);
		const first = relay.relay("capability-check");
		const second = relay.relay("fill-and-submit");

		relay.rejectAll("Agent stopped");
		await expect(first).rejects.toThrow("Agent stopped");
		await expect(second).rejects.toThrow("Agent stopped");
	});
});
