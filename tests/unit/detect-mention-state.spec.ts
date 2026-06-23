import { describe, expect, test } from "vitest";
import {
	buildFileMentionToken,
	buildPickerInsert,
	detectAtState,
	detectSlashState,
	filesToPickerItems,
	resolvePickerState,
	sanitizeTokenName,
} from "../../src/sidepanel/detect-mention-state";

describe("detectAtState", () => {
	test("returns null when no @ before cursor", () => {
		expect(detectAtState("hello world", 5)).toBeNull();
	});

	test("detects @ at start of input", () => {
		const result = detectAtState("@file", 5);
		expect(result).toEqual({
			query: "file",
			startIndex: 0,
			endIndex: 5,
		});
	});

	test("detects @ after whitespace", () => {
		const result = detectAtState("hello @file", 11);
		expect(result).toEqual({
			query: "file",
			startIndex: 6,
			endIndex: 11,
		});
	});

	test("returns null when @ is not at word boundary (email)", () => {
		expect(detectAtState("user@example.com", 16)).toBeNull();
	});

	test("returns null when @ is preceded by non-whitespace", () => {
		expect(detectAtState("hello@world", 11)).toBeNull();
	});

	test("query is empty when @ is immediately followed by nothing", () => {
		const result = detectAtState("hello @", 7);
		expect(result).toEqual({
			query: "",
			startIndex: 6,
			endIndex: 7,
		});
	});

	test("query stops at space", () => {
		const result = detectAtState("hello @file name", 11);
		expect(result).toEqual({
			query: "file",
			startIndex: 6,
			endIndex: 11,
		});
	});

	test("returns null when space exists after @ in the token", () => {
		expect(detectAtState("hello @ file", 12)).toBeNull();
	});

	test("detects @ in middle of text", () => {
		const result = detectAtState("check @readme for details", 13);
		expect(result).toEqual({
			query: "readme",
			startIndex: 6,
			endIndex: 13,
		});
	});

	test("cursor before @ returns null", () => {
		expect(detectAtState("hello @file", 6)).toBeNull();
	});

	test("multiple @ uses the last one before cursor", () => {
		const result = detectAtState("@a @b @c", 8);
		expect(result).toEqual({
			query: "c",
			startIndex: 6,
			endIndex: 8,
		});
	});

	test("returns null for empty string", () => {
		expect(detectAtState("", 0)).toBeNull();
	});

	test("returns null for consecutive @", () => {
		expect(detectAtState("@@file", 6)).toBeNull();
	});

	test("detects @ after tab whitespace", () => {
		const result = detectAtState("hello\t@file", 11);
		expect(result).toEqual({
			query: "file",
			startIndex: 6,
			endIndex: 11,
		});
	});

	test("detects @ after newline whitespace", () => {
		const result = detectAtState("hello\n@file", 11);
		expect(result).toEqual({
			query: "file",
			startIndex: 6,
			endIndex: 11,
		});
	});

	test("query includes special characters like dots", () => {
		const result = detectAtState("check @file.md", 14);
		expect(result).toEqual({
			query: "file.md",
			startIndex: 6,
			endIndex: 14,
		});
	});
});

describe("detectSlashState", () => {
	test("detects / at start of input", () => {
		const result = detectSlashState("/skill", 6);
		expect(result).toEqual({
			startIndex: 0,
			query: "skill",
		});
	});

	test("returns null when / is not at word boundary", () => {
		expect(detectSlashState("foo/bar", 7)).toBeNull();
	});
});

describe("resolvePickerState", () => {
	test("@ takes precedence over / when both detected", () => {
		const result = resolvePickerState("/skill @file", 12);
		expect(result.atState).not.toBeNull();
		expect(result.slashState).toBeNull();
		expect(result.atState?.query).toBe("file");
	});

	test("@ active suppresses slash picker via precedence", () => {
		const result = resolvePickerState("@file/skill", 11);
		expect(result.atState).not.toBeNull();
		expect(result.slashState).toBeNull();
		expect(result.atState?.query).toBe("file/skill");
	});

	test("slash picker opens when no @ is active", () => {
		const result = resolvePickerState("/skill", 6);
		expect(result.atState).toBeNull();
		expect(result.slashState).not.toBeNull();
		expect(result.slashState?.query).toBe("skill");
	});

	test("both states are null when no trigger is present", () => {
		const result = resolvePickerState("hello world", 11);
		expect(result.atState).toBeNull();
		expect(result.slashState).toBeNull();
	});

	test("@ directly after / prefers @ trigger", () => {
		const result = resolvePickerState("/ @file", 7);
		expect(result.atState).not.toBeNull();
		expect(result.slashState).toBeNull();
		expect(result.atState?.query).toBe("file");
	});
});

describe("buildPickerInsert", () => {
	test("inserts token at startIndex with trailing space, cursor after space", () => {
		const result = buildPickerInsert(
			"hello @file",
			11,
			6,
			"@[file:f1:readme.md]",
		);
		expect(result.nextText).toBe("hello @[file:f1:readme.md] ");
		expect(result.cursorPos).toBe(6 + "@[file:f1:readme.md] ".length);
	});

	test("inserts skill token at startIndex", () => {
		const result = buildPickerInsert(
			"/skill",
			6,
			0,
			"/skill:capability-check ",
		);
		expect(result.nextText).toBe("/skill:capability-check ");
		expect(result.cursorPos).toBe("/skill:capability-check ".length);
	});

	test("preserves text after cursor and adds trailing space", () => {
		const result = buildPickerInsert(
			"hello @file world",
			11,
			6,
			"@[file:f1:readme.md]",
		);
		expect(result.nextText).toBe("hello @[file:f1:readme.md]  world");
		expect(result.cursorPos).toBe(6 + "@[file:f1:readme.md] ".length);
	});

	test("uses endIndex to slice after instead of cursor", () => {
		const result = buildPickerInsert(
			"hello @file world",
			11,
			6,
			"@[file:f1:readme.md]",
			11,
		);
		expect(result.nextText).toBe("hello @[file:f1:readme.md]  world");
		expect(result.cursorPos).toBe(6 + "@[file:f1:readme.md] ".length);
	});

	test("endIndex different from cursor slices from endIndex", () => {
		const result = buildPickerInsert(
			"hello @file world",
			15,
			6,
			"@[file:f1:readme.md]",
			11,
		);
		expect(result.nextText).toBe("hello @[file:f1:readme.md]  world");
		expect(result.cursorPos).toBe(6 + "@[file:f1:readme.md] ".length);
	});
});

describe("filesToPickerItems token insertion", () => {
	test("insertText format is @[file:{id}:{name}]", () => {
		const files = [
			{
				id: "f1",
				name: "readme.md",
				path: "/readme.md",
				kind: "file" as const,
			},
		];
		const items = filesToPickerItems(files);
		expect(items[0]?.insertText).toBe("@[file:f1:readme.md]");
	});

	test("returns empty array for empty files", () => {
		const items = filesToPickerItems([]);
		expect(items).toEqual([]);
	});

	test("handles file names with spaces", () => {
		const files = [
			{
				id: "f2",
				name: "my file.txt",
				path: "/my file.txt",
				kind: "file" as const,
			},
		];
		const items = filesToPickerItems(files);
		expect(items[0]?.insertText).toBe("@[file:f2:my file.txt]");
	});

	test("sanitizes ], :, and [ in file names for token", () => {
		const files = [
			{
				id: "f3",
				name: "data[1].txt",
				path: "/data[1].txt",
				kind: "file" as const,
			},
		];
		const items = filesToPickerItems(files);
		expect(items[0]?.insertText).toBe("@[file:f3:data_1_.txt]");
	});

	test("sanitizes multiple special characters", () => {
		const files = [
			{
				id: "f4",
				name: "x] @[file:target:fake].md",
				path: "/x",
				kind: "file" as const,
			},
		];
		const items = filesToPickerItems(files);
		expect(items[0]?.insertText).toBe("@[file:f4:x_ @_file_target_fake_.md]");
	});

	test("maps multiple files", () => {
		const files = [
			{ id: "f1", name: "a.md", path: "/a.md", kind: "file" as const },
			{ id: "f2", name: "b.md", path: "/b.md", kind: "file" as const },
		];
		const items = filesToPickerItems(files);
		expect(items).toHaveLength(2);
		expect(items[0]?.id).toBe("f1");
		expect(items[1]?.id).toBe("f2");
	});

	test("includes non-text files (pdf, png, etc.) — exclude nothing", () => {
		const files = [
			{ id: "f1", name: "notes.md", path: "/notes.md", kind: "file" as const },
			{
				id: "f2",
				name: "photo.png",
				path: "/photo.png",
				kind: "file" as const,
			},
			{ id: "f3", name: "doc.pdf", path: "/doc.pdf", kind: "file" as const },
			{ id: "f4", name: "data.csv", path: "/data.csv", kind: "file" as const },
		];
		const items = filesToPickerItems(files);
		expect(items).toHaveLength(4);
		expect(items.map((i) => i.id)).toEqual(["f1", "f2", "f3", "f4"]);
	});

	test("includes directories alongside files", () => {
		const files = [
			{
				id: "f1",
				name: "readme.md",
				path: "/readme.md",
				kind: "file" as const,
			},
			{ id: "d1", name: "subdir", path: "/subdir", kind: "directory" as const },
		];
		const items = filesToPickerItems(files);
		expect(items).toHaveLength(2);
		expect(items[0]?.id).toBe("f1");
		expect(items[1]?.id).toBe("d1");
	});

	test("directory nodes emit @[dir:...] tokens, not file tokens", () => {
		const files = [
			{
				id: "/project/src",
				name: "src",
				path: "/project/src",
				kind: "directory" as const,
			},
		];
		const items = filesToPickerItems(files);
		expect(items[0]?.insertText).toBe("@[dir:/project/src:src]");
	});
});

describe("buildFileMentionToken", () => {
	test("builds @[file:id:name] format", () => {
		expect(buildFileMentionToken("abc", "readme.md")).toBe(
			"@[file:abc:readme.md]",
		);
	});

	test("preserves spaces in name", () => {
		expect(buildFileMentionToken("abc", "my file.txt")).toBe(
			"@[file:abc:my file.txt]",
		);
	});

	test("sanitizes special characters that would break token parsing", () => {
		expect(buildFileMentionToken("abc", "data[1].txt")).toBe(
			"@[file:abc:data_1_.txt]",
		);
	});

	test("agrees with filesToPickerItems insertText", () => {
		const files = [
			{
				id: "f1",
				name: "readme.md",
				path: "/readme.md",
				kind: "file" as const,
			},
		];
		const items = filesToPickerItems(files);
		expect(buildFileMentionToken("f1", "readme.md")).toBe(items[0]?.insertText);
	});
});

describe("sanitizeTokenName", () => {
	test("replaces brackets and colons with underscore", () => {
		expect(sanitizeTokenName("a[b]:c")).toBe("a_b__c");
	});

	test("passes through plain names", () => {
		expect(sanitizeTokenName("readme.md")).toBe("readme.md");
	});
});
