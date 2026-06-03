const ENABLED_KEY = "stream_debug";
const WORKER_FLAG = "__stream_debug__";

function isEnabled(): boolean {
	try {
		if (typeof globalThis !== "undefined" && (globalThis as Record<string, unknown>)[WORKER_FLAG] === true) return true;
		if (typeof localStorage !== "undefined" && localStorage.getItem(ENABLED_KEY) === "1") return true;
	} catch { /* ignore */ }
	return false;
}

let _counter = 0;

export function streamLog(point: string, data?: Record<string, unknown>): void {
	if (!isEnabled()) return;
	_counter++;
	const ts = performance.now().toFixed(2);
	const payload = data ? ` ${JSON.stringify(data)}` : "";
	console.debug(`[stream #${_counter} ${ts}ms] ${point}${payload}`);
}

export function enableStreamDebug(): void {
	try { (globalThis as Record<string, unknown>)[WORKER_FLAG] = true; } catch { /* ignore */ }
	try { if (typeof localStorage !== "undefined") localStorage.setItem(ENABLED_KEY, "1"); } catch { /* ignore */ }
}
