import { describe, expect, test } from "vitest";
import { escapeHtml, highlightCode } from "../../src/utils/syntax-highlight";

describe("escapeHtml", () => {
	test("escapes < > &", () => {
		expect(escapeHtml("<div> & </div>")).toBe(
			"&lt;div&gt; &amp; &lt;/div&gt;",
		);
	});

	test("no-op for plain text", () => {
		expect(escapeHtml("hello world")).toBe("hello world");
	});
});

describe("highlightCode", () => {
	test("wraps JS identifier definitions", () => {
		const html = highlightCode("const x = 1;", "js");
		expect(html).toContain('<span class="token-identifier-def">const x</span>');
	});

	test("wraps JS strings", () => {
		const html = highlightCode('const x = "hello";', "js");
		expect(html).toContain('<span class="token-string">"hello"</span>');
	});

	test("wraps JS comments", () => {
		const html = highlightCode("// comment", "js");
		expect(html).toContain('<span class="token-comment">// comment</span>');
	});

	test("wraps JS numbers", () => {
		const html = highlightCode("const x = 42;", "js");
		expect(html).toContain('<span class="token-number">42</span>');
	});

	test("wraps JS function calls", () => {
		const html = highlightCode("page.snapshot();", "js");
		expect(html).toContain('<span class="token-function">snapshot</span>');
	});

	test("escapes HTML in code", () => {
		const html = highlightCode('const x = "<div>";', "js");
		expect(html).not.toContain("<div>");
		expect(html).toContain("&lt;div&gt;");
	});

	test("resolves overlapping tokens", () => {
		// "const" inside a string should be string, not keyword
		const html = highlightCode('const x = "const";', "js");
		expect(html).toContain('<span class="token-string">"const"</span>');
		expect(html).not.toContain('<span class="token-keyword">const</span>');
	});

	test("unknown language returns escaped plain text", () => {
		expect(highlightCode("foo", "unknown")).toBe("foo");
	});

	test("handles empty string", () => {
		expect(highlightCode("", "js")).toBe("");
	});

	test("handles Lua", () => {
		const html = highlightCode("local x = 1", "lua");
		expect(html).toContain('<span class="token-keyword">local</span>');
	});
});
