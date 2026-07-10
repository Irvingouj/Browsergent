/**
 * Per-window adapter for @pi-oxide/extension-js.
 *
 * Owns the ExtensionSession lifecycle on the side panel main thread.
 * Both the agent (via worker relay) and the standalone JS tab share
 * this single instance, with access serialized through a queue.
 *
 * Why one instance per panel document: Chrome gives each window its own
 * sidepanel document (own JS realm), and each document owns exactly one
 * ExtensionSession. extension-js now holds the AbortController per-session
 * (no module global), so multiple sessions are safe across windows; within
 * one document we still keep a single client because the panel IS the
 * session scope. This is a product-scope singleton, not a runtime constraint.
 */

import type {
	CellResult,
	ExtensionSession as ExtensionSessionType,
	FsBoolResult,
	FsExistsResult,
	FsListResult,
	FsStatResult,
	FsStringResult,
	FsWriteResult,
} from "@pi-oxide/extension-js";
import { setLogLevel } from "@pi-oxide/extension-js";
import { reportError, reportWarn } from "../errors/report";
import type { FsClient } from "../skills/skill-types";
import { browsergentStore } from "../state/store";

const EXTJS_TIMEOUT_MS = 30_000;

export type { CellResult };

interface ExtjsRelayRequest {
	type: "extjsRunRequest";
	id: string;
	code: string;
	traceId?: string;
}

interface ExtjsRelayResult {
	type: "extjsRunResult";
	id: string;
	result: CellResult;
}

interface ExtjsRelayError {
	type: "extjsRunError";
	id: string;
	error: string;
}

interface ExtjsDocsResult {
	type: "extjsDocsResult";
	id: string;
	docs: string;
}

interface ExtjsDocsError {
	type: "extjsDocsError";
	id: string;
	error: string;
}

interface LoadSkillResult {
	type: "loadSkillResult";
	id: string;
	content: string;
}

interface LoadSkillError {
	type: "loadSkillError";
	id: string;
	error: string;
}

type ExtjsRelayResponse =
	| ExtjsRelayResult
	| ExtjsRelayError
	| ExtjsDocsResult
	| ExtjsDocsError
	| LoadSkillResult
	| LoadSkillError;

export type { ExtjsRelayResponse };

function isExtjsRelayResponse(msg: unknown): msg is ExtjsRelayResponse {
	if (typeof msg !== "object" || msg === null) return false;
	const obj = msg as Record<string, unknown>;
	return (
		(obj.type === "extjsRunResult" ||
			obj.type === "extjsRunError" ||
			obj.type === "extjsDocsResult" ||
			obj.type === "extjsDocsError" ||
			obj.type === "loadSkillResult" ||
			obj.type === "loadSkillError") &&
		typeof obj.id === "string"
	);
}

export class ExtensionJsClient implements FsClient {
	private static instance: ExtensionJsClient | null = null;
	private session: ExtensionSessionType | null = null;
	private runnerPromise: Promise<void> | null = null;
	private queue: Promise<unknown> = Promise.resolve();
	private initialized = false;
	private initPromise: Promise<void> | null = null;
	private onFsMutation: (() => void) | null = null;
	/** Last windowId passed to init — used when OPFS is first touched before Run. */
	private boundWindowId: number | undefined;

	private constructor() {}

	static getInstance(): ExtensionJsClient {
		if (!ExtensionJsClient.instance) {
			ExtensionJsClient.instance = new ExtensionJsClient();
		}
		return ExtensionJsClient.instance;
	}

	setOnFsMutation(cb: (() => void) | null): void {
		this.onFsMutation = cb;
	}

	async init(options?: { windowId?: number }): Promise<void> {
		if (typeof options?.windowId === "number") {
			this.boundWindowId = options.windowId;
		}
		if (this.initialized && this.session) return;
		if (this.initPromise) {
			await this.initPromise;
			return;
		}
		this.initPromise = (async () => {
			// Surface init failures; drop to error-only after success.
			setLogLevel("warn");
			const { ExtensionSession } = await import("@pi-oxide/extension-js");
			const wid =
				typeof options?.windowId === "number"
					? options.windowId
					: this.boundWindowId;
			const initOptions = typeof wid === "number" ? { windowId: wid } : undefined;
			type InitFn = (opts?: { windowId?: number }) => Promise<
				[ExtensionSessionType, Promise<void>]
			>;
			const [session, runner] = await (
				ExtensionSession.init as InitFn
			)(initOptions);
			session.setFuelLimit(Number.MAX_SAFE_INTEGER);
			// Atomic publish: only set session + initialized after BOTH creation and runner start succeed.
			this.session = session;
			this.runnerPromise = runner;
			this.initialized = true;
			setLogLevel("error");
		})();
		try {
			await this.initPromise;
		} catch (err) {
			// Publishing failed: clear the promise so the next init() retries fresh.
			this.initPromise = null;
			reportError({
				code: "E_BOOT_EXTJS",
				source: "extjs",
				message: "ExtensionSession.init failed",
				details: {
					windowId:
						typeof options?.windowId === "number" ? options.windowId : null,
				},
				cause: err,
			});
			throw err;
		}
	}

	async runJs(code: string, traceId?: string): Promise<CellResult> {
		await this.ensureReady();

		return this.enqueue(
			() => this.executeWithTimeout(code, traceId),
			"JS execution failed",
		);
	}

	async getApiDocs(format: "json" | "markdown"): Promise<string> {
		await this.ensureReady();
		return this.executeDocsWithTimeout(format);
	}

	private async fsCall<P, R>(
		op: (fs: ExtensionSessionType["fs"]) => (p: P) => Promise<R>,
		params: P,
		label: string,
	): Promise<R> {
		await this.ensureReady();
		return this.enqueue(async () => {
			if (!this.session) throw new Error("ExtensionSession not available");
			return op(this.session.fs)(params);
		}, label);
	}
	// Reads: no onFsMutation. Return session.fs.* wrapped results directly.
	exists(path: string): Promise<FsExistsResult> {
		return this.fsCall((fs) => fs.exists, { path }, "exists failed");
	}
	stat(path: string): Promise<FsStatResult> {
		return this.fsCall((fs) => fs.stat, { path }, "stat failed");
	}
	list(path: string): Promise<FsListResult> {
		return this.fsCall((fs) => fs.list, { path }, "list failed");
	}
	readText(path: string): Promise<FsStringResult> {
		return this.fsCall((fs) => fs.readText, { path }, "readText failed");
	}
	readBase64(path: string): Promise<FsStringResult> {
		return this.fsCall((fs) => fs.readBase64, { path }, "readBase64 failed");
	}

	// Writes: fire onFsMutation after success.
	async writeText(path: string, data: string): Promise<FsWriteResult> {
		const result = await this.fsCall(
			(fs) => fs.writeText,
			{ path, data },
			"writeText failed",
		);
		this.onFsMutation?.();
		return result;
	}

	async writeBase64(path: string, base64: string): Promise<FsWriteResult> {
		const result = await this.fsCall(
			(fs) => fs.writeBase64,
			{ path, data: base64 },
			"writeBase64 failed",
		);
		this.onFsMutation?.();
		return result;
	}

	async mkdir(path: string): Promise<FsBoolResult> {
		const result = await this.fsCall(
			(fs) => fs.mkdir,
			{ path },
			"mkdir failed",
		);
		this.onFsMutation?.();
		return result;
	}

	async delete(path: string): Promise<FsBoolResult> {
		const result = await this.fsCall(
			(fs) => fs.delete,
			{ path },
			"delete failed",
		);
		this.onFsMutation?.();
		return result;
	}

	async move(from: string, to: string): Promise<FsBoolResult> {
		const result = await this.fsCall(
			(fs) => fs.move,
			{ from, to },
			"move failed",
		);
		this.onFsMutation?.();
		return result;
	}

	async copy(from: string, to: string): Promise<FsBoolResult> {
		const result = await this.fsCall(
			(fs) => fs.copy,
			{ from, to },
			"copy failed",
		);
		this.onFsMutation?.();
		return result;
	}

	private enqueue<T>(fn: () => Promise<T>, errorLabel: string): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			this.queue = this.queue
				.then(async () => {
					try {
						resolve(await fn());
					} catch (err) {
						reject(
							err instanceof Error
								? err
								: new Error(typeof err === "string" ? err : errorLabel),
						);
					}
				})
				.catch((err: unknown) => {
					// Queue chain continuity only — the original reject already fired.
					reportWarn({
						code: "E_HOST_UNKNOWN",
						source: "extjs",
						message: `extjs queue settled with error after reject: ${errorLabel}`,
						cause: err,
					});
				});
		});
	}

	/** Handle a run relay request from the worker. */
	handleRelayRequest(request: ExtjsRelayRequest): void {
		const { id, code, traceId } = request;

		this.runJs(code, traceId)
			.then((result) => {
				this.dispatchRelayResponse({ type: "extjsRunResult", id, result });
			})
			.catch((err: Error) => {
				if (ExtensionJsClient.relayCallback) {
					this.dispatchRelayResponse({
						type: "extjsRunError",
						id,
						error: err.message,
					});
				} else {
					console.error(
						"[extension-js] relay error with no callback:",
						err.message,
						{ id },
					);
				}
			});
	}

	/** Handle a docs relay request from the worker. */
	handleDocsRelayRequest(request: {
		type: "extjsDocsRequest";
		id: string;
		format: "json" | "markdown";
	}): void {
		const { id, format } = request;

		this.getApiDocs(format)
			.then((docs) => {
				this.dispatchRelayResponse({ type: "extjsDocsResult", id, docs });
			})
			.catch((err: Error) => {
				if (ExtensionJsClient.relayCallback) {
					this.dispatchRelayResponse({
						type: "extjsDocsError",
						id,
						error: err.message,
					});
				} else {
					console.error(
						"[extension-js] docs relay error with no callback:",
						err.message,
						{ id },
					);
				}
			});
	}

	/** Dispatch a relay response to the worker via postMessage. */
	private dispatchRelayResponse(msg: ExtjsRelayResponse): void {
		const handler = ExtensionJsClient.relayCallback;
		if (!handler) {
			console.error(
				"[extension-js] relay response dropped: callback not installed",
				{ type: msg.type, id: msg.id },
			);
			return;
		}
		handler(msg);
	}

	static relayCallback: ((msg: ExtjsRelayResponse) => void) | null = null;

	async stop(): Promise<void> {
		if (!this.session || !this.runnerPromise) return;
		try {
			await this.session.stopWith(this.runnerPromise);
		} catch {
			// Best-effort cleanup — the session may already be broken
		}
		this.session = null;
		this.runnerPromise = null;
		this.initialized = false;
		this.initPromise = null;
		this.queue = Promise.resolve();
		await this.init();
	}

	async dispose(): Promise<void> {
		if (!this.session || !this.runnerPromise) return;
		await this.session.stopWith(this.runnerPromise);
		this.session = null;
		this.runnerPromise = null;
		this.initialized = false;
		this.initPromise = null;
		this.queue = Promise.resolve();
	}

	get isReady(): boolean {
		return this.initialized && this.session !== null;
	}

	getWindowId(): number | null {
		const session = this.session as ExtensionSessionType & {
			getWindowId?: () => number | null;
		};
		return session?.getWindowId?.() ?? null;
	}

	rebindWindow(newWindowId: number): void {
		const session = this.session as ExtensionSessionType & {
			rebindWindow?: (windowId: number) => void;
		};
		session?.rebindWindow?.(newWindowId);
	}

	private async ensureReady(): Promise<void> {
		if (this.initialized && this.session) return;
		// Lazy acting host: first OPFS / run_js use may init without explicit caller.
		if (!this.initPromise) {
			await this.init(
				typeof this.boundWindowId === "number"
					? { windowId: this.boundWindowId }
					: undefined,
			);
			return;
		}
		await this.initPromise;
		if (!this.initialized || !this.session) {
			throw new Error("ExtensionJsClient not initialized. Call init() first.");
		}
	}

	private async executeWithTimeout(
		code: string,
		traceId?: string,
	): Promise<CellResult> {
		if (!this.session) {
			throw new Error("ExtensionSession not available");
		}

		try {
			const result = await Promise.race([
				this.session.runCellAsync(code, undefined, traceId),
				new Promise<never>((_resolve, reject) => {
					setTimeout(
						() =>
							reject(
								new Error(`JS execution timed out after ${EXTJS_TIMEOUT_MS}ms`),
							),
						EXTJS_TIMEOUT_MS,
					);
				}),
			]);

			return result;
		} catch (err) {
			const isTimeout =
				err instanceof Error &&
				err.message.includes(
					`JS execution timed out after ${EXTJS_TIMEOUT_MS}ms`,
				);
			if (!isTimeout) {
				await this.rebuildSession();
			}
			throw err;
		}
	}

	private async executeDocsWithTimeout(format: string): Promise<string> {
		if (!this.session) {
			throw new Error("ExtensionSession not available");
		}

		const result = await Promise.race([
			this.session.apiDocs(format),
			new Promise<never>((_resolve, reject) => {
				setTimeout(
					() =>
						reject(
							new Error(`Docs relay timed out after ${EXTJS_TIMEOUT_MS}ms`),
						),
					EXTJS_TIMEOUT_MS,
				);
			}),
		]);

		if (typeof result !== "string") {
			return JSON.stringify(result);
		}
		return result;
	}

	/** Tear down the current session and create a fresh one. */
	private async rebuildSession(): Promise<void> {
		const store = browsergentStore.getState();
		store.extjsRestarting("rebuild");

		if (this.session && this.runnerPromise) {
			try {
				await this.session.stopWith(this.runnerPromise);
			} catch {
				// Best-effort cleanup — the session may already be broken
			}
		}

		this.session = null;
		this.runnerPromise = null;
		this.initialized = false;
		this.initPromise = null; // CRITICAL: force init() to build a new session

		try {
			await this.init();
			const session = this.session as ExtensionSessionType | null;
			if (!session) {
				throw new Error("Rebuilt session is null");
			}
			await Promise.race([
				session.runCellAsync("1+1"),
				new Promise<never>((_, reject) =>
					setTimeout(
						() => reject(new Error("Runtime health check timed out")),
						5_000,
					),
				),
			]);
			store.extjsReady();
		} catch (err) {
			this.session = null;
			this.runnerPromise = null;
			this.initialized = false;
			this.initPromise = null; // leave retryable
			reportError({
				code: "E_BOOT_EXTJS",
				source: "extjs",
				message: "Runtime rebuild failed",
				cause: err,
			});
			store.extjsFailed({
				code: "E_JS_RUNTIME",
				message: "Runtime rebuild failed",
				source: "js",
			});
		}
	}
}

/** Type guard for worker relay message handling. */
export function isExtjsRelayRequest(msg: unknown): msg is ExtjsRelayRequest {
	if (typeof msg !== "object" || msg === null) return false;
	const obj = msg as Record<string, unknown>;
	return (
		obj.type === "extjsRunRequest" &&
		typeof obj.id === "string" &&
		typeof obj.code === "string"
	);
}

export type { ExtjsRelayError, ExtjsRelayRequest, ExtjsRelayResult };
export { isExtjsRelayResponse };
