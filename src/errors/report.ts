/**
 * Unified host-level diagnostic reporting.
 *
 * Fixed console prefix so SW / panel / extension Errors are greppable:
 *   [browsergent][error] code=E_SW_LISTENER source=sw message=...
 *
 * Never throws. Safe to call from any context (SW, panel, worker).
 */

export type HostErrorSource =
	| "sw"
	| "panel"
	| "worker"
	| "extjs"
	| "session"
	| "lifecycle"
	| "relay"
	| "chrome"
	| "boot"
	| "ui";

export type HostErrorCode =
	| "E_BOOT_IDB"
	| "E_BOOT_SESSION"
	| "E_BOOT_EXTJS"
	| "E_BOOT_WORKER"
	| "E_BOOT_WINDOW"
	| "E_SW_LISTENER"
	| "E_SW_FANOUT"
	| "E_SW_STORAGE"
	| "E_RELAY_SEND"
	| "E_RELAY_PARSE"
	| "E_LIFECYCLE"
	| "E_UNHANDLED"
	| "E_HOST_UNKNOWN";

export type DiagnosticLevel = "error" | "warn";

export interface DiagnosticReport {
	ts: number;
	level: DiagnosticLevel;
	code: HostErrorCode | string;
	source: HostErrorSource;
	message: string;
	details?: Record<string, unknown>;
}

export const DIAG_RING_KEY = "bgDiagRing";
export const DIAG_RING_MAX = 50;
export const DIAG_MESSAGE_MAX = 500;

export type ReportSink = (report: DiagnosticReport) => void;

const memoryRing: DiagnosticReport[] = [];
const sinks = new Set<ReportSink>();

/** In-memory ring (panel process). SW also mirrors to chrome.storage.session. */
export function getMemoryDiagRing(): readonly DiagnosticReport[] {
	return memoryRing;
}

export function clearMemoryDiagRing(): void {
	memoryRing.length = 0;
}

/** Subscribe to reports (e.g. UI banner). Returns unsubscribe. */
export function onDiagnosticReport(sink: ReportSink): () => void {
	sinks.add(sink);
	return () => {
		sinks.delete(sink);
	};
}

function truncateMessage(message: string): string {
	if (message.length <= DIAG_MESSAGE_MAX) return message;
	return `${message.slice(0, DIAG_MESSAGE_MAX)}…`;
}

function serializeDetails(
	details: Record<string, unknown> | undefined,
): string {
	if (!details) return "";
	try {
		return JSON.stringify(details, (_key, value) => {
			if (value instanceof Error) {
				return {
					name: value.name,
					message: value.message,
					stack: value.stack?.split("\n").slice(0, 4).join("\n"),
				};
			}
			return value;
		});
	} catch {
		return "[unserializable]";
	}
}

function pushMemory(report: DiagnosticReport): void {
	memoryRing.push(report);
	if (memoryRing.length > DIAG_RING_MAX) {
		memoryRing.splice(0, memoryRing.length - DIAG_RING_MAX);
	}
}

function formatLine(report: DiagnosticReport): string {
	const details = serializeDetails(report.details);
	const base = `[browsergent][${report.level}] code=${report.code} source=${report.source} message=${report.message}`;
	return details ? `${base} details=${details}` : base;
}

function emitConsole(report: DiagnosticReport): void {
	const line = formatLine(report);
	if (report.level === "error") {
		console.error(line);
	} else {
		console.warn(line);
	}
}

function notifySinks(report: DiagnosticReport): void {
	for (const sink of sinks) {
		try {
			sink(report);
		} catch {
			// sinks must never break reporting
		}
	}
}

export function reportDiagnostic(
	input: Omit<DiagnosticReport, "ts"> & { ts?: number; cause?: unknown },
): DiagnosticReport {
	const details: Record<string, unknown> = { ...input.details };
	if (input.cause !== undefined) {
		if (input.cause instanceof Error) {
			details.cause = input.cause.message;
			details.causeName = input.cause.name;
			if (input.cause.stack) {
				details.stack = input.cause.stack.split("\n").slice(0, 6).join("\n");
			}
		} else {
			details.cause = String(input.cause);
		}
	}

	const report: DiagnosticReport = {
		ts: input.ts ?? Date.now(),
		level: input.level,
		code: input.code,
		source: input.source,
		message: truncateMessage(input.message),
		details: Object.keys(details).length > 0 ? details : undefined,
	};

	try {
		emitConsole(report);
		pushMemory(report);
		notifySinks(report);
	} catch {
		// last resort — never throw from report
		try {
			console.error("[browsergent][error] code=E_HOST_UNKNOWN report_failed");
		} catch {
			/* ignore */
		}
	}

	return report;
}

export function reportError(
	input: Omit<DiagnosticReport, "ts" | "level"> & {
		ts?: number;
		cause?: unknown;
	},
): DiagnosticReport {
	return reportDiagnostic({ ...input, level: "error" });
}

export function reportWarn(
	input: Omit<DiagnosticReport, "ts" | "level"> & {
		ts?: number;
		cause?: unknown;
	},
): DiagnosticReport {
	return reportDiagnostic({ ...input, level: "warn" });
}

function errorMessage(err: unknown): string {
	if (err instanceof Error) return err.message;
	return String(err ?? "unknown error");
}

/**
 * Wrap a chrome event listener so sync throws and async rejections never
 * escape to the SW/panel top level (which can kill the service worker).
 */
export function safeListener<TArgs extends unknown[]>(
	name: string,
	handler: (...args: TArgs) => unknown,
	source: HostErrorSource = "sw",
): (...args: TArgs) => void {
	return (...args: TArgs): void => {
		try {
			const result = handler(...args);
			if (
				result !== null &&
				typeof result === "object" &&
				typeof (result as Promise<unknown>).then === "function"
			) {
				void (result as Promise<unknown>).catch((err: unknown) => {
					reportError({
						code: "E_SW_LISTENER",
						source,
						message: `Async listener failed: ${name}`,
						details: { listener: name },
						cause: err,
					});
				});
			}
		} catch (err) {
			reportError({
				code: "E_SW_LISTENER",
				source,
				message: `Listener failed: ${name}: ${errorMessage(err)}`,
				details: { listener: name },
				cause: err,
			});
		}
	};
}

/**
 * chrome.runtime.sendMessage that never rejects uncaught and logs failures.
 * Returns false when the send failed (no receiver is often ok — logged as warn).
 */
export async function sendMessageSafe(
	message: unknown,
	context: { source: HostErrorSource; op: string },
): Promise<boolean> {
	if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
		reportWarn({
			code: "E_RELAY_SEND",
			source: context.source,
			message: `sendMessage unavailable: ${context.op}`,
			details: { op: context.op },
		});
		return false;
	}
	try {
		await chrome.runtime.sendMessage(message);
		// MV3 may set lastError instead of rejecting
		const lastError = chrome.runtime.lastError;
		if (lastError?.message) {
			// "Receiving end does not exist" is common when no panel is open
			const msg = lastError.message;
			const noReceiver = /receiving end does not exist/i.test(msg);
			const report = noReceiver ? reportWarn : reportError;
			report({
				code: "E_RELAY_SEND",
				source: context.source,
				message: `sendMessage lastError: ${context.op}: ${msg}`,
				details: { op: context.op, noReceiver },
			});
			return false;
		}
		return true;
	} catch (err) {
		const msg = errorMessage(err);
		const noReceiver = /receiving end does not exist/i.test(msg);
		const report = noReceiver ? reportWarn : reportError;
		report({
			code: "E_RELAY_SEND",
			source: context.source,
			message: `sendMessage failed: ${context.op}: ${msg}`,
			details: { op: context.op, noReceiver },
			cause: err,
		});
		return false;
	}
}

/** Install window/self error + unhandledrejection handlers (idempotent per realm). */
let globalHandlersInstalled = false;

export function installGlobalErrorHandlers(source: HostErrorSource): void {
	if (globalHandlersInstalled) return;
	globalHandlersInstalled = true;

	const root =
		typeof globalThis !== "undefined"
			? globalThis
			: typeof self !== "undefined"
				? self
				: null;
	if (!root || typeof root.addEventListener !== "function") return;

	root.addEventListener("error", (event: Event) => {
		const e = event as ErrorEvent;
		reportError({
			code: "E_UNHANDLED",
			source,
			message: e.message || "Uncaught error",
			details: {
				filename: e.filename,
				lineno: e.lineno,
				colno: e.colno,
			},
			cause: e.error,
		});
	});

	root.addEventListener("unhandledrejection", (event: Event) => {
		const e = event as PromiseRejectionEvent;
		const reason = e.reason;
		reportError({
			code: "E_UNHANDLED",
			source,
			message:
				reason instanceof Error
					? reason.message
					: `Unhandled rejection: ${String(reason ?? "unknown")}`,
			details: { kind: "unhandledrejection" },
			cause: reason,
		});
	});
}

/** Compact snapshot for clipboard / `__BROWSERGENT_DIAG__`. */
export function formatDiagSnapshot(
	reports: readonly DiagnosticReport[],
	limit = 20,
): string {
	const slice = reports.slice(-limit);
	return slice.map((r) => formatLine(r)).join("\n");
}

/** Read SW-persisted ring (available after SW death from any extension page). */
export async function readDiagRingFromSession(): Promise<DiagnosticReport[]> {
	const storage = globalThis.chrome?.storage?.session;
	if (!storage?.get) return [];
	try {
		const stored = await storage.get(DIAG_RING_KEY);
		if (!Array.isArray(stored[DIAG_RING_KEY])) return [];
		return stored[DIAG_RING_KEY] as DiagnosticReport[];
	} catch {
		return [];
	}
}
