import { describe, expect, test } from "vitest";
import { substituteArguments } from "../../src/skills/substitute-arguments";

describe("substitute-arguments", () => {
	test("replaces $ARGUMENTS", () => {
		const out = substituteArguments("Task: $ARGUMENTS", "hello world");
		expect(out).toBe("Task: hello world");
	});

	test("replaces named arguments", () => {
		const out = substituteArguments("Email: $email", "a@b.com", true, [
			"email",
		]);
		expect(out).toBe("Email: a@b.com");
	});

	test("appends args when no placeholder", () => {
		const out = substituteArguments("Do the thing", "extra context");
		expect(out).toContain("User arguments: extra context");
	});
});
