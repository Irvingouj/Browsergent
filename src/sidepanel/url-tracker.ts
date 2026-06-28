/**
 * Tracks the active tab's top-frame URL and notifies subscribers on change.
 *
 * Owned by the side panel (main thread): chrome.webNavigation / chrome.tabs are
 * main-thread-only. The worker learns URLs only through run_js results and the
 * steer messages we dispatch from here.
 */
export interface UrlState {
	currentUrl: string;
	previousUrl: string | null;
}

export type UrlListener = (state: UrlState) => void;

const FORBIDDEN_SCHEMES = [
	"chrome://",
	"chrome-extension://",
	"edge://",
	"about:",
];

export function isSteerableUrl(url: string): boolean {
	if (!url) return false;
	return !FORBIDDEN_SCHEMES.some((s) => url.startsWith(s));
}

export class UrlTracker {
	private state: UrlState = { currentUrl: "", previousUrl: null };
	private readonly listeners = new Set<UrlListener>();

	onNavigate(url: string): void {
		if (!isSteerableUrl(url)) return;
		if (url === this.state.currentUrl) return;
		this.state = {
			currentUrl: url,
			previousUrl: this.state.currentUrl || null,
		};
		this.emit();
	}

	subscribe(listener: UrlListener): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	getCurrentUrl(): string {
		return this.state.currentUrl;
	}

	private emit(): void {
		for (const l of this.listeners) l(this.state);
	}
}

let _urlTracker: UrlTracker | null = null;

export function getUrlTracker(): UrlTracker {
	if (!_urlTracker) {
		_urlTracker = new UrlTracker();
	}
	return _urlTracker;
}
