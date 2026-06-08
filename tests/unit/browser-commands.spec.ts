import { describe, expect, test } from "vitest";
import type { BrowserCommand } from "../../src/types/browser";

function isBrowserCommand(cmd: unknown): cmd is BrowserCommand {
	if (typeof cmd !== "object" || cmd === null) return false;
	const c = cmd as Record<string, unknown>;
	if (typeof c.kind !== "string") return false;

	switch (c.kind) {
		case "page.snapshot":
			if ("options" in c && typeof c.options !== "object") return false;
			return true;
		case "page.click":
			return typeof c.refId === "string";
		case "page.fill":
			return typeof c.refId === "string" && typeof c.text === "string";
		case "page.clear":
			return typeof c.refId === "string";
		case "page.select":
			return typeof c.refId === "string" && typeof c.value === "string";
		case "page.press":
			return typeof c.key === "string";
		case "page.scroll":
			return (
				typeof c.direction === "string" &&
				(c.direction === "up" || c.direction === "down") &&
				(!("amount" in c) || typeof c.amount === "number")
			);
		case "page.extract":
			return !("refId" in c) || typeof c.refId === "string";
		case "page.url":
		case "page.title":
		case "page.back":
		case "page.forward":
		case "page.reload":
			return true;
		case "page.wait":
			return typeof c.ms === "number";
		case "page.goto":
			return typeof c.url === "string";
		default:
			return false;
	}
}

describe("BrowserCommand type coverage", () => {
	const commands: BrowserCommand[] = [
		{ kind: "page.snapshot" },
		{ kind: "page.snapshot", options: { onlyVisible: true, maxElements: 100 } },
		{ kind: "page.click", refId: "e1" },
		{ kind: "page.fill", refId: "e1", text: "hello" },
		{ kind: "page.clear", refId: "e1" },
		{ kind: "page.select", refId: "e1", value: "option1" },
		{ kind: "page.press", key: "Enter" },
		{ kind: "page.scroll", direction: "down", amount: 200 },
		{ kind: "page.scroll", direction: "up" },
		{ kind: "page.extract" },
		{ kind: "page.extract", refId: "e1" },
		{ kind: "page.url" },
		{ kind: "page.title" },
		{ kind: "page.wait", ms: 500 },
		{ kind: "page.goto", url: "https://example.com" },
		{ kind: "page.back" },
		{ kind: "page.forward" },
		{ kind: "page.reload" },
	];

	test("isBrowserCommand accepts every valid command kind", () => {
		for (const cmd of commands) {
			expect(isBrowserCommand(cmd)).toBe(true);
		}
	});

	test("isBrowserCommand rejects invalid shapes", () => {
		expect(isBrowserCommand({ kind: "page.click" })).toBe(false);
		expect(isBrowserCommand({ kind: "page.fill", refId: "e1" })).toBe(false);
		expect(isBrowserCommand({ kind: "page.scroll", direction: "left" })).toBe(
			false,
		);
		expect(isBrowserCommand({ kind: "page.wait", ms: "100" })).toBe(false);
		expect(isBrowserCommand({ kind: "page.goto" })).toBe(false);
		expect(isBrowserCommand({ kind: "page.unknown" })).toBe(false);
		expect(isBrowserCommand(null)).toBe(false);
		expect(isBrowserCommand("string")).toBe(false);
	});

	test("every BrowserCommand kind is present in test list", () => {
		const kinds = new Set(commands.map((c) => c.kind));
		const expectedKinds = [
			"page.snapshot",
			"page.click",
			"page.fill",
			"page.clear",
			"page.select",
			"page.press",
			"page.scroll",
			"page.extract",
			"page.url",
			"page.title",
			"page.wait",
			"page.goto",
			"page.back",
			"page.forward",
			"page.reload",
		];
		for (const kind of expectedKinds) {
			expect(kinds.has(kind)).toBe(true);
		}
		expect(kinds.size).toBe(expectedKinds.length);
	});
});
