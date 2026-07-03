import { describe, expect, test } from "vitest";
import { hasUrl, linkify } from "../../src/utils/linkify";

describe("linkify", () => {
	test("no URL -> escaped plain text", () => {
		expect(linkify("hello <world> & friend")).toBe(
			"hello &lt;world&gt; &amp; friend",
		);
	});

	test("wraps a bare http URL", () => {
		const html = linkify("see http://example.com now");
		expect(html).toContain(
			'<a href="http://example.com" class="linkify" target="_blank" rel="noopener noreferrer">http://example.com</a>',
		);
		expect(html).toContain("see ");
		expect(html).toContain(" now");
	});

	test("wraps an https URL", () => {
		const html = linkify("go https://x.com/y");
		expect(html).toContain('href="https://x.com/y"');
	});

	test("trims trailing punctuation from the URL", () => {
		const html = linkify("See https://example.com.");
		expect(html).toContain('href="https://example.com"');
		expect(html).toContain(">https://example.com</a>.");
	});

	test("escapes HTML in surrounding text", () => {
		const html = linkify("a <b> https://x.com </b>");
		expect(html).toContain("&lt;b&gt;");
	});

	test("quote in URL stops the link, no attribute breakout", () => {
		const html = linkify('https://x.com/a" onclick="evil');
		// The link tag is well-formed with the URL truncated at the quote.
		expect(html).toContain(
			'<a href="https://x.com/a" class="linkify" target="_blank" rel="noopener noreferrer">https://x.com/a</a>',
		);
		// The trailing quote + payload is text, not inside the <a> tag.
		expect(html).not.toMatch(/class="linkify"[^>]*onclick/);
	});

	test("multiple URLs in one string", () => {
		const html = linkify("first https://a.com and https://b.com");
		expect(html).toContain('href="https://a.com"');
		expect(html).toContain('href="https://b.com"');
	});

	test("URL with path and query preserved", () => {
		const html = linkify("link https://x.com/p?q=1&r=2 end");
		expect(html).toContain('href="https://x.com/p?q=1&amp;r=2"');
	});

	test("empty string", () => {
		expect(linkify("")).toBe("");
	});

	test("trailing comma trimmed", () => {
		const html = linkify("visit https://x.com, then");
		expect(html).toContain('href="https://x.com"');
		expect(html).toContain("</a>, then");
	});
});

describe("hasUrl", () => {
	test("true for http", () => {
		expect(hasUrl("go http://x.com")).toBe(true);
	});
	test("true for https", () => {
		expect(hasUrl("https://x.com")).toBe(true);
	});
	test("false for plain text", () => {
		expect(hasUrl("no link here")).toBe(false);
	});
	test("false for ftp", () => {
		expect(hasUrl("ftp://x.com")).toBe(false);
	});
});