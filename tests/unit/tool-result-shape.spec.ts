import { describe, expect, test } from "vitest";
import {
	recordCapChars,
	shapeToolResultText,
} from "../../src/worker/tool-result-shape";

describe("shapeToolResultText", () => {
	test("keeps a 70/30 head and tail and names the saved file", () => {
		const text = "abcdefghijKLMNOPQRST";
		const shaped = shapeToolResultText(text, 10, "/artifacts/tc_test.txt");
		expect(shaped.truncated).toBe(true);
		expect(shaped.forCore.startsWith("abcdefg")).toBe(true);
		expect(shaped.forCore.endsWith("RST")).toBe(true);
		expect(shaped.forCore).toContain(
			"10 characters omitted (20 total). Full output saved to /artifacts/tc_test.txt",
		);
		expect(shaped.forCore).not.toContain("KLMNOPQ");
	});

	test("leaves a short result unchanged", () => {
		const shaped = shapeToolResultText("short page", 10, "/artifacts/tc_x.txt");
		expect(shaped).toEqual({ forCore: "short page", truncated: false });
	});

	test("scales the record cap with the model budget", () => {
		expect(recordCapChars(123_904)).toBe(22_302);
		expect(recordCapChars(195_904)).toBe(35_262);
		expect(recordCapChars(267_904)).toBe(48_000);
		expect(recordCapChars(1_000)).toBe(16_000);
	});
});
