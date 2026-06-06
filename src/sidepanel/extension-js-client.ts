/**
 * Singleton adapter for @pi-oxide/extension-js.
 *
 * Owns the ExtensionSession lifecycle on the side panel main thread.
 * Both the agent (via worker relay) and the standalone JS tab share
 * this single instance, with access serialized through a queue.
 *
 * Why singleton: extension-js's runner uses a module-level AbortController.
 * Multiple ExtensionSession instances would race on the same abort signal.
 */

import type {
	ExtensionSession as ExtensionSessionType,
	JsRunResult,
} from "@pi-oxide/extension-js";
import { browsergentStore } from "../state/store";

const EXTJS_TIMEOUT_MS = 30_000;

export type { JsRunResult };

interface ExtjsRelayRequest {
	type: "extjsRunRequest";
	id: string;
	code: string;
}

interface ExtjsRelayResult {
	type: "extjsRunResult";
	id: string;
	result: JsRunResult;
}

interface ExtjsRelayError {
	type: "extjsRunError";
	id: string;
	error: string;
}

type ExtjsRelayResponse = ExtjsRelayResult | ExtjsRelayError;

function isExtjsRelayResponse(msg: unknown): msg is ExtjsRelayResponse {
	if (typeof msg !== "object" || msg === null) return false;
	const obj = msg as Record<string, unknown>;
	return (
		(obj.type === "extjsRunResult" || obj.type === "extjsRunError") &&
		typeof obj.id === "string"
	);
}

export class ExtensionJsClient {
	private static instance: ExtensionJsClient | null = null;
	private session: ExtensionSessionType | null = null;
	private runnerPromise: Promise<void> | null = null;
	private queue: Promise<unknown> = Promise.resolve();
	private initialized = false;
	private initPromise: Promise<void> | null = null;

	private constructor() {}

	static getInstance(): ExtensionJsClient {
		if (!ExtensionJsClient.instance) {
			ExtensionJsClient.instance = new ExtensionJsClient();
		}
		return ExtensionJsClient.instance;
	}

	async init(): Promise<void> {
		if (this.initialized) return;
		this.initPromise = (async () => {
			const { ExtensionSession } = await import("@pi-oxide/extension-js");
			const [session, runner] = await ExtensionSession.init();
			session.setFuelLimit(1_000_000);
			this.session = session;
			this.runnerPromise = runner;
			this.initialized = true;
		})();
		await this.initPromise;
	}

	async runJs(code: string): Promise<JsRunResult> {
		await this.ensureReady();

		return new Promise<JsRunResult>((resolve, reject) => {
			// Chain onto queue and catch to prevent rejection from breaking future calls
			this.queue = this.queue
				.then(async () => {
					try {
						const result = await this.executeWithTimeout(code);
						resolve(result);
					} catch (err) {
						reject(
							err instanceof Error
								? err
								: new Error(
										typeof err === "string" ? err : "JS execution failed",
									),
						);
					}
				})
				// Prevent a rejected queue from propagating to subsequent calls
				.catch(() => {});
		});
	}

	/** Handle a relay request from the worker. */
	handleRelayRequest(request: ExtjsRelayRequest): void {
		const { id, code } = request;

		this.runJs(code)
			.then((result) => {
				this.dispatchRelayResponse({ type: "extjsRunResult", id, result });
			})
			.catch((err: Error) => {
				this.dispatchRelayResponse({
					type: "extjsRunError",
					id,
					error: err.message,
				});
			});
	}

	/** Dispatch a relay response to the worker via postMessage. */
	private dispatchRelayResponse(msg: ExtjsRelayResponse): void {
		const handler = ExtensionJsClient.relayCallback;
		if (handler) {
			handler(msg);
		}
	}

	static relayCallback: ((msg: ExtjsRelayResponse) => void) | null = null;

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

	private async ensureReady(): Promise<void> {
		if (this.initialized && this.session) return;
		if (this.initPromise) {
			await this.initPromise;
		}
		if (!this.initialized || !this.session) {
			throw new Error("ExtensionJsClient not initialized. Call init() first.");
		}
	}

	private async executeWithTimeout(code: string): Promise<JsRunResult> {
		if (!this.session) {
			throw new Error("ExtensionSession not available");
		}

		try {
			const result = await Promise.race([
				this.session.runCellAsync(code),
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
			// On timeout or crash, tear down and rebuild the session
			await this.rebuildSession();
			throw err;
		}
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

		try {
			await this.init();
			const session = this.session as ExtensionSessionType | null;
			if (session) {
				await Promise.race([
					session.runCellAsync("1+1"),
					new Promise<never>((_, reject) =>
						setTimeout(
							() => reject(new Error("Runtime health check timed out")),
							5_000,
						),
					),
				]);
			}
			store.extjsReady();
		} catch {
			this.session = null;
			this.runnerPromise = null;
			this.initialized = false;
			this.initPromise = null;
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
