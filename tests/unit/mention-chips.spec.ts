import { describe, expect, test } from "vitest";
import {
	renderMarkdown,
	tokenizeMentions,
} from "../../src/utils/markdown-stream";

describe("tokenizeMentions", () => {
	test("returns single text segment for plain text", () => {
		const result = tokenizeMentions("hello world");
		expect(result).toEqual([{ type: "text", text: "hello world" }]);
	});

	test("splits file mentions from surrounding text", () => {
		const result = tokenizeMentions("Check @[file:abc-123:src/App.tsx] please");
		expect(result).toEqual([
			{ type: "text", text: "Check " },
			{
				type: "file",
				fileId: "abc-123",
				name: "src/App.tsx",
				raw: "@[file:abc-123:src/App.tsx]",
			},
			{ type: "text", text: " please" },
		]);
	});

	test("splits tab mentions", () => {
		const result = tokenizeMentions("See @[tab:42:GitHub] for more");
		expect(result).toEqual([
			{ type: "text", text: "See " },
			{
				type: "tab",
				tabId: "42",
				title: "GitHub",
				raw: "@[tab:42:GitHub]",
			},
			{ type: "text", text: " for more" },
		]);
	});

	test("splits skill tokens", () => {
		const result = tokenizeMentions("/skill:foo-bar do the thing");
		expect(result).toEqual([
			{
				type: "skill",
				skillName: "foo-bar",
				raw: "/skill:foo-bar",
			},
			{ type: "text", text: " do the thing" },
		]);
	});

	test("splits dir mentions", () => {
		const result = tokenizeMentions("see @[dir:/project/src:src] now");
		expect(result).toEqual([
			{ type: "text", text: "see " },
			{
				type: "dir",
				path: "/project/src",
				name: "src",
				raw: "@[dir:/project/src:src]",
			},
			{ type: "text", text: " now" },
		]);
	});

	test("handles multiple tokens of different kinds", () => {
		const result = tokenizeMentions(
			"/skill:check @[file:f1:notes.md] @[tab:1:Home] go",
		);
		// segments: [skill, text(" "), file, text(" "), tab, text(" go")]
		expect(result).toHaveLength(6);
		expect(result[0]).toMatchObject({
			type: "skill",
			skillName: "check",
		});
		expect(result[2]).toMatchObject({
			type: "file",
			name: "notes.md",
		});
		expect(result[4]).toMatchObject({
			type: "tab",
			title: "Home",
		});
	});

	test("returns empty array for empty string", () => {
		const result = tokenizeMentions("");
		expect(result).toEqual([]);
	});
});

describe("renderMarkdown with tokens", () => {
	test("renders file mentions as chips with basename and escaped title", () => {
		const html = renderMarkdown("Look at @[file:f1:src/util/foo.ts] carefully");
		expect(html).toContain("mention-chip");
		expect(html).toContain('data-chip-kind="file"');
		expect(html).toContain("foo.ts");
		expect(html).toContain('title="src/util/foo.ts"');
		// Markdown text still rendered
		expect(html).toContain("Look at");
		expect(html).toContain("carefully");
	});

	test("renders tab mentions as chips with truncated label", () => {
		const html = renderMarkdown("Switch to @[tab:7:GitHub: Let's build]");
		expect(html).toContain("mention-chip");
		expect(html).toContain('data-chip-kind="tab"');
		// Title appears escaped in the title attr
		expect(html).toContain("GitHub: Let");
		expect(html).toContain('title="GitHub: Let');
	});

	test("renders skill tokens as chips with / prefix", () => {
		const html = renderMarkdown("/skill:capability-check do it");
		expect(html).toContain("mention-chip");
		expect(html).toContain('data-chip-kind="skill"');
		expect(html).toContain("/");
		expect(html).toContain("capability-check");
	});

	test("renders dir mentions as chips with trailing slash", () => {
		const html = renderMarkdown("@[dir:/project/src:src] go");
		expect(html).toContain("mention-chip");
		expect(html).toContain('data-chip-kind="dir"');
		expect(html).toContain('title="/project/src"');
		expect(html).toContain("src/");
	});

	test("escapes HTML in token attributes", () => {
		const html = renderMarkdown(
			"@[file:f1:<script>alert(1)</script>.md] hello",
		);
		// The chip's inner text and title attribute must escape < and >
		expect(html).not.toContain("<script>");
		expect(html).toContain("&lt;script&gt;");
		// alert(1) appears inside the escaped title attribute — that's safe
		expect(html).toContain('title="');
		expect(html).toContain(".md");
	});

	test("renders plain markdown unchanged when no tokens present", () => {
		const html = renderMarkdown("**bold** and _italic_");
		expect(html).toContain("<strong>bold</strong>");
		expect(html).toContain("<em>italic</em>");
		expect(html).not.toContain("mention-chip");
	});
});
