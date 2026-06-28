import { expect, test, type Page } from "@playwright/test";
import { launchExtension, readTaskInput } from "./helpers";

// Verifies the post-refactor invariants (input-refactor-plan.md N1-N4):
// - typing updates value AND keeps caret at the insertion point (never 0)
// - caret survives continued typing mid-string
// - chip insertion + continued typing keeps caret at end
//
// Pre-refactor, the "conditional innerHTML rewrite" destroyed the Selection
// anchor on transient DOM/value divergence (IME, <br> residue), dropping the
// caret to offset 0. The new model makes the DOM an unconditional view of
// (value, offset), so a lost caret is impossible by construction.

async function caretOffset(sidePanel: Page): Promise<number> {
	return sidePanel.evaluate(() => {
		const el = document.querySelector('[data-testid="task-input"]');
		if (!el) return 0;
		const sel = window.getSelection();
		if (!sel || sel.rangeCount === 0) return 0;
		const range = sel.getRangeAt(0);
		if (!el.contains(range.startContainer)) return 0;
		// Flatten text + chip data-raw into a canonical offset.
		let offset = 0;
		let reached = false;
		const walk = (parent: Node): void => {
			parent.childNodes.forEach((child) => {
				if (reached) return;
				if (child === range.startContainer) {
					if (child.nodeType === Node.TEXT_NODE) {
						offset += range.startOffset;
					} else {
						const span = child as HTMLElement;
						const raw = span.getAttribute("data-raw");
						offset += raw ? (range.startOffset > 0 ? raw.length : 0) : range.startOffset;
					}
					reached = true;
					return;
				}
				if (child.nodeType === Node.TEXT_NODE) {
					offset += child.textContent?.length ?? 0;
				} else if (child.nodeType === Node.ELEMENT_NODE) {
					const span = child as HTMLElement;
					const raw = span.getAttribute("data-raw");
					if (raw) {
						offset += raw.length;
					} else if (range.startContainer === child || (child as Element).contains(range.startContainer)) {
						walk(child);
					} else {
						offset += span.textContent?.length ?? 0;
					}
				}
			});
		};
		walk(el);
		return offset;
	});
}

test("typing keeps caret at the end (never jumps to 0)", async () => {
	test.setTimeout(60000);
	const { sidePanel, close } = await launchExtension();

	const input = sidePanel.locator('[data-testid="task-input"]');
	await input.click();
	await input.type("hello world");

	const value = await readTaskInput(sidePanel);
	expect(value).toBe("hello world");

	const offset = await caretOffset(sidePanel);
	expect(offset).toBe("hello world".length);

	await close();
});

test("continued typing after the first keystroke keeps caret moving forward", async () => {
	test.setTimeout(60000);
	const { sidePanel, close } = await launchExtension();

	const input = sidePanel.locator('[data-testid="task-input"]');
	await input.click();
	await input.type("ab");
	expect(await caretOffset(sidePanel)).toBe(2);
	await input.type("cdef");
	expect(await caretOffset(sidePanel)).toBe(6);
	expect(await readTaskInput(sidePanel)).toBe("abcdef");

	await close();
});

test("mid-string insertion lands caret after the inserted char", async () => {
	test.setTimeout(60000);
	const { sidePanel, close } = await launchExtension();

	const input = sidePanel.locator('[data-testid="task-input"]');
	await input.click();
	await input.type("hello");
	// Move caret to offset 2 (between "he" and "llo").
	await sidePanel.evaluate(() => {
		const el = document.querySelector('[data-testid="task-input"]') as HTMLElement;
		const sel = window.getSelection();
		if (!sel || !el || el.firstChild?.nodeType !== Node.TEXT_NODE) return;
		const range = document.createRange();
		range.setStart(el.firstChild, 2);
		range.collapse(true);
		sel.removeAllRanges();
		sel.addRange(range);
	});
	await input.type("X");
	expect(await readTaskInput(sidePanel)).toBe("heXllo");
	expect(await caretOffset(sidePanel)).toBe(3);

	await close();
});
