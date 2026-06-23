import { describe, expect, test } from "vitest";
import {
	buildDirContextXmlBlock,
	dedupeDirMentionsById,
	parseDirMentions,
	stripDirMentions,
} from "../../src/sidepanel/resolve-dir-mentions";

describe("parseDirMentions", () => {
	test("returns empty for plain text", () => {
		expect(parseDirMentions("hello world")).toEqual([]);
	});

	test("parses a single dir mention", () => {
		const mentions = parseDirMentions("see @[dir:/project/src:src] here");
		expect(mentions).toHaveLength(1);
		expect(mentions[0]).toEqual({
			dirId: "/project/src",
			path: "/project/src",
			displayName: "src",
			raw: "@[dir:/project/src:src]",
		});
	});

	test("parses multiple dir mentions", () => {
		const text = "@[dir:/a:alpha] and @[dir:/b:beta]";
		const mentions = parseDirMentions(text);
		expect(mentions).toHaveLength(2);
		expect(mentions[0]?.path).toBe("/a");
		expect(mentions[1]?.path).toBe("/b");
	});

	test("does not match file or tab tokens", () => {
		expect(parseDirMentions("@[file:f1:x.ts]")).toEqual([]);
		expect(parseDirMentions("@[tab:1:Hi]")).toEqual([]);
	});
});

describe("stripDirMentions", () => {
	test("removes dir tokens, keeps surrounding text", () => {
		expect(stripDirMentions("see @[dir:/p:s] now")).toBe("see  now");
	});

	test("no-op when no dir tokens", () => {
		expect(stripDirMentions("@[file:f1:x.ts] plain")).toBe(
			"@[file:f1:x.ts] plain",
		);
	});
});

describe("dedupeDirMentionsById", () => {
	test("drops duplicate paths", () => {
		const mentions = parseDirMentions("@[dir:/p:s] @[dir:/p:s] @[dir:/q:q]");
		const deduped = dedupeDirMentionsById(mentions);
		expect(deduped).toHaveLength(2);
		expect(deduped.map((m) => m.path)).toEqual(["/p", "/q"]);
	});
});

interface DirContextChild {
	name: string;
	path: string;
	kind: "file" | "directory";
	size: number;
	isText: boolean;
}

describe("buildDirContextXmlBlock", () => {
	test("empty children → note form", () => {
		const [mention] = parseDirMentions("@[dir:/project/src:src]");
		expect(buildDirContextXmlBlock(mention!, [])).toBe(
			'<directory_reference path="/project/src" name="src">\n' +
				"  <note>directory empty or not found</note>\n" +
				"</directory_reference>",
		);
	});

	test("single file child", () => {
		const [mention] = parseDirMentions("@[dir:/project/src:src]");
		const child: DirContextChild = {
			name: "readme.md",
			path: "/project/src/readme.md",
			kind: "file",
			size: 123,
			isText: true,
		};
		expect(buildDirContextXmlBlock(mention!, [child])).toBe(
			'<directory_reference path="/project/src" name="src">\n' +
				'  <entry path="/project/src/readme.md" name="readme.md" size="123" kind="file" isText="yes" />\n' +
				"</directory_reference>",
		);
	});

	test("single directory child", () => {
		const [mention] = parseDirMentions("@[dir:/project/src:src]");
		const child: DirContextChild = {
			name: "sub",
			path: "/project/src/sub",
			kind: "directory",
			size: 0,
			isText: false,
		};
		expect(buildDirContextXmlBlock(mention!, [child])).toBe(
			'<directory_reference path="/project/src" name="src">\n' +
				'  <entry path="/project/src/sub" name="sub" size="0" kind="directory" isText="no" />\n' +
				"</directory_reference>",
		);
	});

	test("escapes special chars in child attributes", () => {
		const mention = {
			dirId: "/p",
			path: "/p",
			displayName: 'a"b<c>',
			raw: '@[dir:/p:a"b<c>]',
		};
		const child: DirContextChild = {
			name: 'a"b<c>.md',
			path: '/p/a"b<c>.md',
			kind: "file",
			size: 0,
			isText: true,
		};
		const result = buildDirContextXmlBlock(mention, [child]);
		expect(result).toContain('name="a&quot;b&lt;c&gt;.md"');
		expect(result).toContain('path="/p/a&quot;b&lt;c&gt;.md"');
		expect(result).toContain('name="a&quot;b&lt;c&gt;"');
	});

	test("mixed children preserve order", () => {
		const [mention] = parseDirMentions("@[dir:/a:alpha]");
		const fileChild: DirContextChild = {
			name: "x.ts",
			path: "/a/x.ts",
			kind: "file",
			size: 10,
			isText: true,
		};
		const dirChild: DirContextChild = {
			name: "sub",
			path: "/a/sub",
			kind: "directory",
			size: 0,
			isText: false,
		};
		const result = buildDirContextXmlBlock(mention!, [fileChild, dirChild]);
		const filePos = result.indexOf('kind="file"');
		const dirPos = result.indexOf('kind="directory"');
		expect(filePos).toBeLessThan(dirPos);
	});

	test("caps entries beyond limit with a truncation note", () => {
		const [mention] = parseDirMentions("@[dir:/big:big]");
		const many: DirContextChild[] = Array.from({ length: 60 }, (_, i) => ({
			name: `f${i}.md`,
			path: `/big/f${i}.md`,
			kind: "file" as const,
			size: 0,
			isText: true,
		}));
		const result = buildDirContextXmlBlock(mention!, many);
		// First and last of the first 50 are present.
		expect(result).toContain('path="/big/f0.md"');
		expect(result).toContain('path="/big/f49.md"');
		// 51st onward omitted.
		expect(result).not.toContain('path="/big/f50.md"');
		expect(result).not.toContain('path="/big/f59.md"');
		// Truncation note present and counts remaining entries.
		expect(result).toContain(
			"<note>10 more entries omitted; use file_list to enumerate</note>",
		);
	});

	test("does not cap when at or below limit", () => {
		const [mention] = parseDirMentions("@[dir:/ok:ok]");
		const fifty: DirContextChild[] = Array.from({ length: 50 }, (_, i) => ({
			name: `f${i}.md`,
			path: `/ok/f${i}.md`,
			kind: "file" as const,
			size: 0,
			isText: true,
		}));
		const result = buildDirContextXmlBlock(mention!, fifty);
		expect(result).not.toContain("omitted");
		expect(result).toContain('path="/ok/f49.md"');
	});
});
