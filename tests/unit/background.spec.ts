import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

describe("background service worker", () => {
	beforeEach(() => {
		vi.resetModules();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	test("opens side panel on action click", async () => {
		const openSpy = vi.fn().mockResolvedValue(undefined);
		const listeners: Array<(tab: { id?: number }) => void> = [];

		vi.stubGlobal("chrome", {
			action: {
				onClicked: {
					addListener: (fn: (tab: { id?: number }) => void) => {
						listeners.push(fn);
					},
				},
			},
			sidePanel: { open: openSpy },
			tabs: {
				onUpdated: {
					addListener: vi.fn(),
				},
			},
		});

		await import("../../src/background/index");

		expect(listeners).toHaveLength(1);
		await listeners[0]({ id: 42 });
		expect(openSpy).toHaveBeenCalledWith({ tabId: 42 });
	});

	test("does nothing when tab has no id", async () => {
		const openSpy = vi.fn().mockResolvedValue(undefined);
		const listeners: Array<(tab: { id?: number }) => void> = [];

		vi.stubGlobal("chrome", {
			action: {
				onClicked: {
					addListener: (fn: (tab: { id?: number }) => void) => {
						listeners.push(fn);
					},
				},
			},
			sidePanel: { open: openSpy },
			tabs: {
				onUpdated: {
					addListener: vi.fn(),
				},
			},
		});

		await import("../../src/background/index");

		expect(listeners).toHaveLength(1);
		await listeners[0]({});
		expect(openSpy).not.toHaveBeenCalled();
	});

	test("registers tab update listener", async () => {
		const addListenerSpy = vi.fn();

		vi.stubGlobal("chrome", {
			action: {
				onClicked: {
					addListener: vi.fn(),
				},
			},
			sidePanel: { open: vi.fn() },
			tabs: {
				onUpdated: {
					addListener: addListenerSpy,
				},
			},
		});

		await import("../../src/background/index");

		expect(addListenerSpy).toHaveBeenCalled();
	});
});
