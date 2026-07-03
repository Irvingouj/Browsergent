import { describe, expect, test } from "vitest";
import {
	applyCsvEdit,
	parseCsv,
	serializeCsv,
	serializeCsvField,
} from "../../src/utils/csv";

describe("parseCsv", () => {
	test("simple rows", () => {
		expect(parseCsv("a,b,c\n1,2,3")).toEqual([
			["a", "b", "c"],
			["1", "2", "3"],
		]);
	});

	test("trailing newline does not produce an empty row", () => {
		expect(parseCsv("a,b\n1,2\n")).toEqual([
			["a", "b"],
			["1", "2"],
		]);
	});

	test("CRLF line endings", () => {
		expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
			["a", "b"],
			["1", "2"],
		]);
	});

	test("lone CR line endings", () => {
		expect(parseCsv("a,b\r1,2\r")).toEqual([
			["a", "b"],
			["1", "2"],
		]);
	});

	test("empty string yields no rows", () => {
		expect(parseCsv("")).toEqual([]);
	});

	test("single field, no newline", () => {
		expect(parseCsv("hello")).toEqual([["hello"]]);
	});

	test("quoted field with comma", () => {
		expect(parseCsv('"a,b",c')).toEqual([["a,b", "c"]]);
	});

	test("quoted field with embedded newline", () => {
		expect(parseCsv('"line1\nline2",x')).toEqual([["line1\nline2", "x"]]);
	});

	test("doubled quotes = literal quote", () => {
		expect(parseCsv('"she said ""hi""",x')).toEqual([['she said "hi"', "x"]]);
	});

	test("ragged rows preserved", () => {
		expect(parseCsv("a,b,c\n1,2")).toEqual([
			["a", "b", "c"],
			["1", "2"],
		]);
	});
});

describe("serializeCsvField", () => {
	test("plain value unquoted", () => {
		expect(serializeCsvField("hello")).toBe("hello");
	});

	test("empty stays empty (not quoted)", () => {
		expect(serializeCsvField("")).toBe("");
	});

	test("comma triggers quoting", () => {
		expect(serializeCsvField("a,b")).toBe('"a,b"');
	});

	test("quote triggers quoting and is doubled", () => {
		expect(serializeCsvField('a"b')).toBe('"a""b"');
	});

	test("newline triggers quoting", () => {
		expect(serializeCsvField("a\nb")).toBe('"a\nb"');
	});
});

describe("serializeCsv", () => {
	test("round-trips simple data with CRLF and trailing newline", () => {
		const text = serializeCsv([
			["a", "b"],
			["1", "2"],
		]);
		expect(text).toBe("a,b\r\n1,2\r\n");
	});

	test("round-trips quoted fields", () => {
		const rows = [
			["name", "note"],
			["Jo,Ann", 'say "hi"'],
		];
		const text = serializeCsv(rows);
		expect(text).toBe('name,note\r\n"Jo,Ann","say ""hi"""\r\n');
		expect(parseCsv(text)).toEqual(rows);
	});

	test("empty rows -> empty string", () => {
		expect(serializeCsv([])).toBe("");
	});

	test("preserves embedded newline round-trip", () => {
		const rows = [["x", "line1\nline2"]];
		expect(parseCsv(serializeCsv(rows))).toEqual(rows);
	});
});

describe("applyCsvEdit", () => {
	test("replaces a single cell, returns a new copy", () => {
		const rows: ReadonlyArray<ReadonlyArray<string>> = [
			["a", "b"],
			["1", "2"],
		];
		const next = applyCsvEdit(rows, { row: 1, col: 0, value: "X" });
		expect(next).toEqual([
			["a", "b"],
			["X", "2"],
		]);
		// input untouched
		expect(rows[1][0]).toBe("1");
	});
});
