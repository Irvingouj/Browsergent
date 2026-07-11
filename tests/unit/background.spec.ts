import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

function chromeStub(overrides: Record<string, unknown> = {}) {
	const detachedListeners: Array<
		(tabId: number, info: { oldWindowId: number }) => void
	> = [];
	const attachedListeners: Array<
		(tabId: number, info: { newWindowId: number }) => void
	> = [];
	const removedListeners: Array<(windowId: number) => void> = [];
	const tabRemovedListeners: Array<(tabId: number) => void> = [];
	const createdListeners: Array<(window: { id?: number }) => void> = [];

	return {
		action: {
			onClicked: {
				addListener: vi.fn(),
			},
		},
		sidePanel: { open: vi.fn().mockResolvedValue(undefined) },
		tabs: {
			onDetached: {
				addListener: (
					fn: (tabId: number, info: { oldWindowId: number }) => void,
				) => {
					detachedListeners.push(fn);
				},
			},
			onAttached: {
				addListener: (
					fn: (tabId: number, info: { newWindowId: number }) => void,
				) => {
					attachedListeners.push(fn);
				},
			},
			onRemoved: {
				addListener: (fn: (tabId: number) => void) => {
					tabRemovedListeners.push(fn);
				},
			},
		},
		windows: {
			onRemoved: {
				addListener: (fn: (windowId: number) => void) => {
					removedListeners.push(fn);
				},
			},
			onCreated: {
				addListener: (fn: (window: { id?: number }) => void) => {
					createdListeners.push(fn);
				},
			},
			getLastFocused: vi.fn().mockResolvedValue({ id: 99 }),
			getAll: vi.fn().mockResolvedValue([{ id: 99 }]),
		},
		runtime: {
			sendMessage: vi.fn().mockResolvedValue(undefined),
			onMessage: {
				addListener: vi.fn(),
			},
			lastError: undefined as { message?: string } | undefined,
		},
		storage: {
			session: {
				get: vi.fn().mockResolvedValue({}),
				set: vi.fn().mockResolvedValue(undefined),
			},
		},
		...overrides,
		__listeners: {
			detachedListeners,
			attachedListeners,
			removedListeners,
			tabRemovedListeners,
			createdListeners,
		},
	};
}

describe("background service worker", () => {
	beforeEach(() => {
		vi.resetModules();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	test("opens side panel on action click", async () => {
		const chrome = chromeStub();
		const listeners: Array<(tab: { id?: number }) => void> = [];
		chrome.action.onClicked.addListener = (
			fn: (tab: { id?: number }) => void,
		) => {
			listeners.push(fn);
		};

		vi.stubGlobal("chrome", chrome);

		await import("../../src/background/index");

		expect(listeners).toHaveLength(1);
		await listeners[0]({ id: 42 });
		expect(chrome.sidePanel.open).toHaveBeenCalledWith({ tabId: 42 });
	});

	test("does nothing when tab has no id", async () => {
		const chrome = chromeStub();
		const listeners: Array<(tab: { id?: number }) => void> = [];
		chrome.action.onClicked.addListener = (
			fn: (tab: { id?: number }) => void,
		) => {
			listeners.push(fn);
		};

		vi.stubGlobal("chrome", chrome);

		await import("../../src/background/index");

		await listeners[0]({});
		expect(chrome.sidePanel.open).not.toHaveBeenCalled();
	});

	test("resolvePanelWindowId prefers sender tab and sidepanel URL query", async () => {
		const chrome = chromeStub();
		vi.stubGlobal("chrome", chrome);

		await import("../../src/background/index");

		type ResolveListener = (
			message: unknown,
			sender: { url?: string; tab?: { windowId?: number } },
			sendResponse: (r: unknown) => void,
		) => void;
		const listeners = chrome.runtime.onMessage.addListener.mock.calls.map(
			(call) => call[0] as ResolveListener,
		);
		const resolveListener = listeners.find((fn) => {
			let responded: unknown;
			fn(
				{ type: "resolvePanelWindowId" },
				{
					url: "chrome-extension://ext/sidepanel.html?windowId=999",
					tab: { windowId: 111 },
				},
				(r) => {
					responded = r;
				},
			);
			return responded !== undefined;
		});
		expect(resolveListener).toBeTypeOf("function");

		let responded: unknown;
		resolveListener?.(
			{ type: "resolvePanelWindowId" },
			{
				url: "chrome-extension://ext/sidepanel.html?windowId=999",
				tab: { windowId: 111 },
			},
			(r) => {
				responded = r;
			},
		);
		expect(responded).toEqual({ windowId: 111 });
	});

	test("registers window lifecycle listeners", async () => {
		const chrome = chromeStub();
		vi.stubGlobal("chrome", chrome);

		await import("../../src/background/index");

		expect(chrome.__listeners.detachedListeners).toHaveLength(1);
		expect(chrome.__listeners.attachedListeners).toHaveLength(1);
		expect(chrome.__listeners.removedListeners).toHaveLength(1);
	});

	test("relays sessionRunRelay from sidepanel but not from service worker echo", async () => {
		const chrome = chromeStub({
			storage: {
				session: {
					set: vi.fn().mockResolvedValue(undefined),
				},
			},
		});
		vi.stubGlobal("chrome", chrome);

		await import("../../src/background/index");

		const relay = {
			type: "sessionRunRelay",
			sessionId: "s-1",
			event: { type: "agentStatus", runId: "r-1", status: "running" },
		};

		type RelayListener = (message: unknown, sender: { url?: string }) => void;
		const listeners = chrome.runtime.onMessage.addListener.mock.calls.map(
			(call) => call[0] as RelayListener,
		);
		const relayListener = listeners.find((fn) => {
			chrome.runtime.sendMessage.mockClear();
			fn(
				{
					type: "sessionRunRelay",
					sessionId: "s-probe",
					event: { type: "agentStatus", runId: "r", status: "running" },
				},
				{ url: "chrome-extension://abc/sidepanel.html" },
			);
			const called = chrome.runtime.sendMessage.mock.calls.length > 0;
			chrome.runtime.sendMessage.mockClear();
			return called;
		});
		expect(relayListener).toBeTypeOf("function");

		chrome.runtime.sendMessage.mockClear();
		relayListener?.(relay, {
			url: "chrome-extension://abc/sidepanel.html",
		});
		expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(relay);

		chrome.runtime.sendMessage.mockClear();
		relayListener?.(relay, { id: "abc" });
		expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
	});

	test("onMessage listener throw is swallowed by safeListener", async () => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const { safeListener } = await import("../../src/errors/report");
		const wrapped = safeListener("test-throw", () => {
			throw new Error("intentional");
		});
		expect(() => wrapped()).not.toThrow();
		expect(errorSpy).toHaveBeenCalled();
		const line = String(errorSpy.mock.calls[0]?.[0] ?? "");
		expect(line).toContain("[browsergent][error]");
		expect(line).toContain("E_SW_LISTENER");
		errorSpy.mockRestore();
	});
});
