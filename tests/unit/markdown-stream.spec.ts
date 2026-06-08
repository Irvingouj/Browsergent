import { describe, expect, test } from "vitest";
import {
	createStreamingMarkdownRenderer,
	renderMarkdown,
} from "../../src/utils/markdown-stream";

describe("renderMarkdown", () => {
	test("renders bold inline text", () => {
		const html = renderMarkdown("Hello **world**");
		expect(html).toContain("<strong>world</strong>");
		expect(html).not.toContain("Token with");
	});

	test("renders headings and lists with bold", () => {
		const html = renderMarkdown(
			"## Jobs\n\n1. **Door-to-Door Sales** — Outdoor Sales\n2. **Cashier** — Store",
		);
		expect(html).toContain("<h2");
		expect(html).toContain("<strong>Door-to-Door Sales</strong>");
		expect(html).toContain("<strong>Cashier</strong>");
	});

	test("renders links with bold label", () => {
		const html = renderMarkdown(
			"See [**Indeed**](https://example.com) for more.",
		);
		expect(html).toContain('<a href="https://example.com"');
		expect(html).toContain("<strong>Indeed</strong>");
	});
});

describe("createStreamingMarkdownRenderer", () => {
	test("streams partial then complete markdown without throwing", () => {
		const render = createStreamingMarkdownRenderer();
		expect(() => render("Hello **wo")).not.toThrow();
		expect(() => render("Hello **world**")).not.toThrow();
		const html = render("Hello **world**");
		expect(html).toContain("<strong>world</strong>");
	});
});
