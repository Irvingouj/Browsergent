import { describe, expect, test, vi } from "vitest";
import {
	UrlTracker,
	isSteerableUrl,
} from "../../src/sidepanel/url-tracker";

describe("isSteerableUrl", () => {
	test("rejects chrome:// and extension URLs", () => {
		expect(isSteerableUrl("chrome://newtab")).toBe(false);
		expect(isSteerableUrl("chrome-extension://abc/options.html")).toBe(false);
		expect(isSteerableUrl("about:blank")).toBe(false);
	});

	test("accepts http(s) URLs", () => {
		expect(isSteerableUrl("https://linkedin.com/jobs")).toBe(true);
		expect(isSteerableUrl("http://localhost:3000")).toBe(true);
	});

	test("rejects empty", () => {
		expect(isSteerableUrl("")).toBe(false);
	});
});

describe("UrlTracker", () => {
	test("emits on first navigate to a steerable URL", () => {
		const tracker = new UrlTracker();
		const fn = vi.fn();
		tracker.subscribe(fn);
		tracker.onNavigate("https://linkedin.com/jobs");
		expect(fn).toHaveBeenCalledTimes(1);
		expect(fn).toHaveBeenCalledWith({
			currentUrl: "https://linkedin.com/jobs",
			previousUrl: null,
		});
	});

	test("does not emit on same-URL re-navigate", () => {
		const tracker = new UrlTracker();
		tracker.onNavigate("https://a.com");
		const fn = vi.fn();
		tracker.subscribe(fn);
		tracker.onNavigate("https://a.com");
		expect(fn).not.toHaveBeenCalled();
	});

	test("emits with previousUrl on change", () => {
		const tracker = new UrlTracker();
		tracker.onNavigate("https://a.com");
		const fn = vi.fn();
		tracker.subscribe(fn);
		tracker.onNavigate("https://b.com");
		expect(fn).toHaveBeenCalledWith({
			currentUrl: "https://b.com",
			previousUrl: "https://a.com",
		});
	});

	test("ignores forbidden-scheme navigations", () => {
		const tracker = new UrlTracker();
		const fn = vi.fn();
		tracker.subscribe(fn);
		tracker.onNavigate("chrome://newtab");
		expect(fn).not.toHaveBeenCalled();
		expect(tracker.getCurrentUrl()).toBe("");
	});

	test("unsubscribe stops notifications", () => {
		const tracker = new UrlTracker();
		const fn = vi.fn();
		const unsub = tracker.subscribe(fn);
		unsub();
		tracker.onNavigate("https://a.com");
		expect(fn).not.toHaveBeenCalled();
	});
});
